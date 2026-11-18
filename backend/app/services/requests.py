from datetime import timedelta
from time import perf_counter

from sqlalchemy.dialects.sqlite import insert

from app.ai import ollama, rules
from app.models.records import AuditEvent, Execution, RequestRecord, SeedMarker, utc_now
from app.schemas.requests import Analysis
from app.workflows.engine import plan

PRIORITIES = ("Low", "Normal", "High", "Critical")
DEMO_REQUESTS = [
    "Please review why invoice INV-1042 was charged twice. A refund of $129.00 is requested.",
    "The customer portal is experiencing a critical outage. IT needs to investigate immediately.",
    "Can we get pricing and a demo for 25 seats next month?",
    "Order ORD-1988 arrived damaged. Please review the replacement options.",
    "Could Operations share the updated office hours? No rush.",
    "A laptop camera stopped working after the last update. Please review.",
    "Our team would like a proposal for an annual subscription.",
    "Please verify invoice INV-2016 for CHF 420.00 before issuing a payment.",
]


def process(session, text, *, demo=False, created_at=None):
    start = perf_counter()
    rule_result = rules.classify(text)
    model_result = None if demo else ollama.classify(text)
    result = model_result or rule_result
    priority = max((result.priority, rule_result.priority), key=PRIORITIES.index)
    name, department, steps, approval = plan(text, result.category, priority)
    method = "ollama" if model_result else "rules"
    analysis = Analysis(
        **result.model_dump(exclude={"priority"}), priority=priority,
        department=department, recommended_actions=[step["label"] for step in steps[1:]],
        processing_method=method,
    )
    timestamp = created_at or utc_now()
    request = RequestRecord(
        text=text, analysis=analysis.model_dump(), demo=demo, created_at=timestamp,
        duration_ms=round((perf_counter() - start) * 1000),
    )
    session.add(request)
    session.flush()
    execution = Execution(
        request_id=request.id, name=name, steps=steps, created_at=timestamp,
        status="pending_approval" if approval else "completed",
    )
    session.add(execution)
    session.flush()
    session.add(AuditEvent(
        execution_id=execution.id, created_at=timestamp,
        event="approval_requested" if approval else "workflow_completed",
        detail=f"{name} prepared using {'Ollama' if model_result else 'deterministic rules'}.",
    ))
    return request, execution


def seed(session):
    result = session.execute(insert(SeedMarker).values(id=1).on_conflict_do_nothing())
    if result.rowcount != 1:
        return
    now = utc_now()
    for index, demo in enumerate(DEMO_REQUESTS):
        process(session, demo, demo=True, created_at=now - timedelta(days=index * 0.76))
