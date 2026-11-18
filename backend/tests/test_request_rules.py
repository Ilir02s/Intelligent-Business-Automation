import pytest

from app.ai.rules import classify
from app.workflows.engine import plan


def test_classify_extracts_distinct_entities():
    analysis = classify("Please refund $180 for invoice INV-2048.\nReference INV-2048.")

    assert analysis.category == "Billing"
    assert [(entity.type, entity.value) for entity in analysis.entities] == [
        ("Reference", "INV-2048"),
        ("Amount", "$180"),
    ]


@pytest.mark.parametrize(
    ("text", "priority", "requires_approval", "statuses"),
    [
        ("Our VPN needs a routine update", "Normal", False, ["completed", "ready"]),
        ("Please reset my password", "Normal", True, ["completed", "pending", "blocked"]),
        ("VPN outage", "Critical", True, ["completed", "pending", "blocked"]),
    ],
)
def test_plan_gates_sensitive_and_critical_requests(text, priority, requires_approval, statuses):
    _, department, steps, needs_approval = plan(text, "IT support", priority)

    assert department == "IT Operations"
    assert needs_approval is requires_approval
    assert [step["status"] for step in steps] == statuses
