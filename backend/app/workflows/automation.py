import re
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import JSON, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.ai import rules
from app.core.database import Base
from app.models.records import utc_now

Kind = Literal["trigger", "classify", "condition", "approval", "assign", "task", "notify", "end"]
REQUIRED_APPROVAL = "__required_approval__"


class Node(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")
    kind: Kind
    label: str = Field(min_length=1, max_length=120)
    x: int = Field(default=24, ge=0, le=10000)
    y: int = Field(default=24, ge=0, le=10000)
    next: str = Field(default="", max_length=64)
    alternate: str = Field(default="", max_length=64)
    field: Literal["category", "priority", "text", "amount", "reference", "email", "date"] = "category"
    operator: Literal["equals", "contains", "greater_than", "exists"] = "equals"
    value: str = Field(default="", max_length=500)


class Graph(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    nodes: list[Node] = Field(max_length=100)


class Automation(Base):
    __tablename__ = "automations"
    id: Mapped[int] = mapped_column(primary_key=True)
    draft: Mapped[dict] = mapped_column(JSON)
    version: Mapped[int] = mapped_column(default=0)


class Version(Base):
    __tablename__ = "automation_versions"
    __table_args__ = (UniqueConstraint("automation_id", "number"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    automation_id: Mapped[int] = mapped_column(ForeignKey("automations.id"))
    number: Mapped[int]
    graph: Mapped[dict] = mapped_column(JSON)


class Run(Base):
    __tablename__ = "automation_runs"
    __table_args__ = (UniqueConstraint("automation_id", "intake_key"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    automation_id: Mapped[int] = mapped_column(ForeignKey("automations.id"), index=True)
    version_id: Mapped[int] = mapped_column(ForeignKey("automation_versions.id"))
    intake_key: Mapped[str | None]
    text: Mapped[str]
    state: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str]
    revision: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)


class WorkItem(Base):
    __tablename__ = "automation_work_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("automation_runs.id"), index=True)
    kind: Mapped[str]
    title: Mapped[str]
    owner: Mapped[str]
    done: Mapped[bool] = mapped_column(default=False)


def edges(node):
    if node.kind in {"condition", "approval"}:
        return [node.next, node.alternate]
    return [] if node.kind == "end" else [node.next]


def validate(graph):
    nodes = {node.id: node for node in graph.nodes}
    triggers = [node.id for node in graph.nodes if node.kind == "trigger"]
    if len(nodes) != len(graph.nodes) or len(triggers) != 1:
        raise ValueError("Use unique node IDs and exactly one trigger.")
    for node in graph.nodes:
        if any(target not in nodes for target in edges(node)):
            raise ValueError(f"Connect all outputs on {node.label}.")
    visited = set()
    active = set()

    def visit(key):
        if key in active:
            raise ValueError("Workflows cannot contain cycles.")
        if key in visited:
            return
        active.add(key)
        for target in edges(nodes[key]):
            visit(target)
        active.remove(key)
        visited.add(key)

    visit(triggers[0])
    if visited != nodes.keys():
        raise ValueError("Connect every node to the trigger.")
    return triggers[0]


def numeric(value):
    try:
        cleaned = re.sub(r"^(?:CHF|USD|EUR|GBP|[$€£])\s*", "", value.strip(), flags=re.IGNORECASE)
        number = Decimal(cleaned.replace(",", "").rstrip("."))
        return number if number.is_finite() else None
    except InvalidOperation:
        return None


def condition(node, value):
    if node.operator == "exists":
        return bool(value)
    if node.operator == "greater_than":
        left, right = numeric(value), numeric(node.value)
        return left is not None and right is not None and left > right
    if node.operator == "contains":
        return node.value.casefold() in value.casefold()
    return node.value.casefold() == value.casefold()


def render(template, values):
    return re.sub(r"{{\s*(category|priority|amount|reference|email|date)\s*}}",
                  lambda match: values.get(match[1], ""), template).strip()


def advance(graph, text, state=None, decision=None, reason=""):
    nodes = {node.id: node for node in graph.nodes}
    if state is None:
        key = validate(graph)
        analysis = rules.classify(text)
        values = {"text": text, "category": analysis.category, "priority": analysis.priority}
        for entity in reversed(analysis.entities):
            values[entity.type.lower()] = entity.value
        required = analysis.priority == "Critical" or rules.matches(rules.SENSITIVE, text)
        state = {"cursor": key, "trace": [], "owner": "", "items": [], "cleared": False,
                 "values": values, "required": required}
    else:
        state = {**state, "trace": list(state["trace"]), "items": list(state["items"])}
        key = state["cursor"]

    values = state["values"]
    if decision:
        # Older graphs may use the marker as a node ID. Only synthetic pauses have a resume node.
        resume = state.pop("resume", None)
        required_pause = key == REQUIRED_APPROVAL and resume is not None and not state["cleared"]
        target = "" if required_pause else (
            nodes[key].next if decision == "approve" else nodes[key].alternate
        )
        state["trace"].append({"id": key, "status": decision, "detail": reason, "target": target})
        if decision == "approve":
            state["cleared"] = True
        if required_pause:
            if decision == "reject":
                return {**state, "cursor": ""}, "rejected"
            key = resume
        else:
            key = target

    while key:
        node = nodes[key]
        detail = ""
        target = node.next
        if node.kind in {"assign", "task", "notify", "end"} and state["required"] and not state["cleared"]:
            state["trace"].append({"id": REQUIRED_APPROVAL, "status": "pending",
                                   "detail": "Sensitive or critical request"})
            return {**state, "cursor": REQUIRED_APPROVAL, "resume": key}, "pending_approval"
        if node.kind == "classify":
            detail = f"{values['category']} · {values['priority']}"
        elif node.kind == "condition":
            value = values.get(node.field, "")
            matched = condition(node, value)
            target = node.next if matched else node.alternate
            detail = f"{node.field} = {value or '(missing)'} · {'Matched' if matched else 'Did not match'}"
        elif node.kind == "approval":
            state["trace"].append({"id": key, "status": "pending", "detail": node.value})
            return {**state, "cursor": key}, "pending_approval"
        elif node.kind == "assign":
            detail = render(node.value, values)
            state["owner"] = detail
        elif node.kind in {"task", "notify"}:
            detail = render(node.value, values) or node.label
            state["items"].append({"kind": node.kind, "title": detail, "owner": state["owner"]})
        elif node.kind == "end":
            target = ""
        state["trace"].append({"id": key, "status": "completed", "detail": detail, "target": target})
        key = target
    return {**state, "cursor": ""}, "completed"
