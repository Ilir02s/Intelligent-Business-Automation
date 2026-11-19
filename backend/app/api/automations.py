import csv
from io import StringIO
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from app.api.routes import database, iso
from app.schemas.requests import RequestInput
from app.workflows.automation import Automation, Graph, Run, Version, WorkItem, advance, validate

router = APIRouter(prefix="/api")


class Intake(RequestInput):
    intake_key: str | None = Field(default=None, min_length=1, max_length=128)


class CsvIntake(BaseModel):
    csv_text: str = Field(min_length=1, max_length=850000)


class Preview(RequestInput):
    graph: Graph
    decisions: list[Literal["approve", "reject"]] = Field(default_factory=list, max_length=101)


class Review(RequestInput):
    decision: Literal["approve", "reject"]
    revision: int = Field(ge=0)


def get(session, model, key):
    row = session.get(model, key)
    if row is None:
        raise HTTPException(404, "Record not found.")
    return row


def run_data(run):
    return {"id": run.id, "automation_id": run.automation_id, "version_id": run.version_id,
            "status": run.status, "revision": run.revision, "created_at": iso(run.created_at),
            "trace": run.state["trace"], "owner": run.state["owner"], "text": run.text}


def automation_data(row):
    return {"id": row.id, "draft": row.draft, "version": row.version}


def check(graph):
    try:
        validate(graph)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


def add_items(session, run, state, offset=0):
    for item in state["items"][offset:]:
        session.add(WorkItem(run_id=run.id, **item))


@router.get("/automations")
def list_automations(session=Depends(database)):
    return [automation_data(row) for row in session.scalars(select(Automation).order_by(Automation.id.desc()))]


@router.post("/automations", status_code=201)
def create(graph: Graph, session=Depends(database)):
    row = Automation(draft=graph.model_dump())
    session.add(row)
    session.commit()
    return automation_data(row)


@router.post("/automations/preview")
def preview(body: Preview):
    check(body.graph)
    state, status = advance(body.graph, body.text)
    for decision in body.decisions:
        if status != "pending_approval":
            break
        state, status = advance(body.graph, body.text, state, decision, "Simulated decision")
    return {"status": status, "trace": state["trace"], "items": state["items"]}


@router.post("/automations/{key}/draft")
def save_draft(key: int, graph: Graph, session=Depends(database)):
    row = get(session, Automation, key)
    row.draft = graph.model_dump()
    session.commit()
    return automation_data(row)


@router.post("/automations/{key}/publish")
def publish(key: int, session=Depends(database)):
    row = get(session, Automation, key)
    check(Graph.model_validate(row.draft))
    number = row.version + 1
    session.add(Version(automation_id=key, number=number, graph=row.draft))
    row.version = number
    try:
        session.commit()
    except IntegrityError as exc:
        raise HTTPException(409, "This workflow was just published. Reload and try again.") from exc
    return automation_data(row)


@router.get("/automations/{key}/versions")
def versions(key: int, session=Depends(database)):
    get(session, Automation, key)
    rows = session.scalars(select(Version).where(Version.automation_id == key).order_by(Version.number.desc()))
    return [{"id": row.id, "number": row.number, "graph": row.graph} for row in rows]


def start_run(session, key: int, body: Intake):
    row = get(session, Automation, key)
    existing = select(Run).where(Run.automation_id == key, Run.intake_key == body.intake_key)
    if body.intake_key:
        previous = session.scalar(existing)
        if previous:
            if previous.text != body.text:
                raise HTTPException(409, "This intake key already belongs to a different request.")
            return run_data(previous)
    version = session.scalar(select(Version).where(Version.automation_id == key, Version.number == row.version))
    if version is None:
        raise HTTPException(409, "Publish the workflow before starting a run.")
    state, status = advance(Graph.model_validate(version.graph), body.text)
    run = Run(automation_id=key, version_id=version.id, text=body.text,
              intake_key=body.intake_key, state=state, status=status)
    session.add(run)
    try:
        session.flush()
        add_items(session, run, state)
        session.commit()
    except IntegrityError:
        session.rollback()
        previous = session.scalar(existing) if body.intake_key else None
        if previous and previous.text == body.text:
            return run_data(previous)
        raise HTTPException(409, "Could not create this run.")
    return run_data(run)


@router.post("/automations/{key}/runs", status_code=201)
def start(key: int, body: Intake, session=Depends(database)):
    return start_run(session, key, body)


@router.post("/automations/{key}/csv")
def csv_intake(key: int, body: CsvIntake, session=Depends(database)):
    reader = csv.DictReader(StringIO(body.csv_text.removeprefix("\ufeff"), newline=""), strict=True)
    inputs = []
    try:
        if not reader.fieldnames or "text" not in reader.fieldnames:
            raise ValueError("Include a text column in the CSV.")
        if len(set(reader.fieldnames)) != len(reader.fieldnames):
            raise ValueError("CSV column names must be unique.")
        for row in reader:
            if len(inputs) >= 100:
                raise ValueError("Upload at most 100 requests at a time.")
            if None in row or None in row.values():
                raise ValueError(f"CSV line {reader.line_num} does not match the header.")
            inputs.append(Intake(text=row.get("text"), intake_key=row.get("intake_key") or None))
    except ValidationError as exc:
        raise HTTPException(422, f"Invalid request on CSV line {reader.line_num}.") from exc
    except (csv.Error, ValueError) as exc:
        raise HTTPException(422, str(exc)) from exc
    if not inputs:
        raise HTTPException(422, "Include at least one request.")
    results = []
    for index, item in enumerate(inputs, start=1):
        try:
            results.append({"row": index, "run": start_run(session, key, item)})
        except HTTPException as exc:
            results.append({"row": index, "error": exc.detail})
    return results


@router.get("/automations/{key}/runs")
def runs(key: int, session=Depends(database)):
    rows = session.scalars(select(Run).where(Run.automation_id == key).order_by(Run.id.desc()).limit(100))
    return [run_data(row) for row in rows]


@router.post("/automation-runs/{key}/decision")
def decide(key: int, body: Review, session=Depends(database)):
    run = get(session, Run, key)
    if run.status != "pending_approval" or run.revision != body.revision:
        raise HTTPException(409, "This approval is no longer pending.")
    version = get(session, Version, run.version_id)
    state, status = advance(Graph.model_validate(version.graph), run.text, run.state, body.decision, body.text)
    claimed = session.execute(update(Run).where(Run.id == key, Run.revision == body.revision)
                              .values(state=state, status=status, revision=body.revision + 1)
                              .execution_options(synchronize_session=False))
    if claimed.rowcount != 1:
        raise HTTPException(409, "This approval is no longer pending.")
    add_items(session, run, state, len(run.state["items"]))
    session.commit()
    session.refresh(run)
    return run_data(run)


@router.get("/automation-work-items")
def work_items(session=Depends(database)):
    rows = session.scalars(select(WorkItem).order_by(WorkItem.id.desc()).limit(100))
    return [{"id": row.id, "run_id": row.run_id, "kind": row.kind,
             "title": row.title, "owner": row.owner, "done": row.done} for row in rows]


@router.post("/automation-work-items/{key}/complete")
def complete(key: int, session=Depends(database)):
    row = get(session, WorkItem, key)
    row.done = True
    session.commit()
    return {"id": key, "done": True}
