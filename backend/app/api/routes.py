from datetime import timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select, update

from app.ai import ollama
from app.models.records import AuditEvent, Execution, RequestRecord, utc_now
from app.schemas.requests import Decision, RequestInput
from app.services.requests import process

router = APIRouter(prefix="/api")


def database(request: Request):
    with request.app.state.sessions() as session:
        yield session


def iso(value):
    return value.replace(tzinfo=timezone.utc).isoformat() if value else None


def execution_data(execution, record):
    return {
        "id": execution.id, "request_id": record.id, "name": execution.name,
        "status": execution.status, "steps": execution.steps, "created_at": iso(execution.created_at),
        "decided_at": iso(execution.decided_at), "analysis": record.analysis,
        "duration_ms": record.duration_ms, "demo": record.demo,
    }


def joined():
    return select(Execution, RequestRecord).join(RequestRecord, Execution.request_id == RequestRecord.id)


@router.get("/health")
def health(session=Depends(database)):
    session.execute(select(1))
    return {"status": "ok", "database": "SQLite"}


@router.get("/ai/status")
def ai_status():
    return ollama.status()


@router.post("/requests/analyze", status_code=201)
def analyze(body: RequestInput, session=Depends(database)):
    record, execution = process(session, body.text)
    session.commit()
    return execution_data(execution, record)


@router.get("/requests")
def history(limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0), session=Depends(database)):
    rows = session.execute(joined().order_by(Execution.id.desc()).offset(offset).limit(limit))
    return [{**execution_data(execution, record), "text": record.text} for execution, record in rows]


@router.get("/workflows")
def executions(limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0), session=Depends(database)):
    rows = session.execute(joined().order_by(Execution.id.desc()).offset(offset).limit(limit))
    return [execution_data(*row) for row in rows]


@router.get("/workflows/{execution_id}")
def execution_detail(execution_id: int, session=Depends(database)):
    row = session.execute(joined().where(Execution.id == execution_id)).one_or_none()
    if not row:
        raise HTTPException(404, "Workflow not found")
    return execution_data(*row)


@router.post("/workflows/{execution_id}/decision")
def decide(execution_id: int, body: Decision, session=Depends(database)):
    # Claim the pending state before reading its steps, so concurrent decisions cannot both win.
    status = "completed" if body.decision == "approve" else "rejected"
    now = utc_now()
    result = session.execute(
        update(Execution).where(Execution.id == execution_id, Execution.status == "pending_approval")
        .values(status=status, decided_at=now)
    )
    if result.rowcount != 1:
        if session.get(Execution, execution_id) is None:
            raise HTTPException(404, "Workflow not found")
        raise HTTPException(409, "Workflow already has a final status")
    execution, record = session.execute(joined().where(Execution.id == execution_id)).one()
    execution.steps = [
        {**step, "status": {
            "pending": "approved" if status == "completed" else "rejected",
            "blocked": "ready" if status == "completed" else "cancelled",
        }.get(step["status"], step["status"])}
        for step in execution.steps
    ]
    session.add(AuditEvent(
        execution_id=execution_id, event="workflow_approved" if status == "completed" else "workflow_rejected",
        detail="A local operator recorded the approval decision.", created_at=now,
    ))
    session.commit()
    return execution_data(execution, record)


@router.get("/activity")
def activity(limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0), session=Depends(database)):
    rows = session.execute(
        select(AuditEvent, Execution, RequestRecord)
        .join(Execution, AuditEvent.execution_id == Execution.id)
        .join(RequestRecord, Execution.request_id == RequestRecord.id)
        .order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc()).offset(offset).limit(limit)
    )
    return [{
        "id": event.id, "event": event.event, "detail": event.detail, "created_at": iso(event.created_at),
        "execution": execution_data(execution, record),
    } for event, execution, record in rows]


@router.get("/dashboard")
def dashboard(days: int = Query(7, ge=7, le=30), session=Depends(database)):
    today = utc_now().date()
    dates = [today - timedelta(days=i) for i in reversed(range(days))]
    day = func.date(RequestRecord.created_at)
    daily = dict(session.execute(
        select(day, func.count()).where(day >= dates[0].isoformat()).group_by(day)
    ).all())
    completed_day = func.date(func.coalesce(Execution.decided_at, Execution.created_at))
    daily_completed = dict(session.execute(
        select(completed_day, func.count())
        .where(Execution.status == "completed", completed_day >= dates[0].isoformat())
        .group_by(completed_day)
    ).all())
    counts = dict(session.execute(select(Execution.status, func.count()).group_by(Execution.status)).all())
    total, duration = session.execute(select(func.count(RequestRecord.id), func.avg(RequestRecord.duration_ms))).one()
    recent = session.execute(joined().order_by(Execution.created_at.desc(), Execution.id.desc()).limit(6))
    return {
        "total": total, "pending": counts.get("pending_approval", 0), "completed": counts.get("completed", 0),
        "average_ms": round(duration or 0, 1),
        "activity": [{
            "date": date.isoformat(), "count": daily.get(date.isoformat(), 0),
            "completed": daily_completed.get(date.isoformat(), 0),
        } for date in dates],
        "recent": [execution_data(*row) for row in recent],
    }
