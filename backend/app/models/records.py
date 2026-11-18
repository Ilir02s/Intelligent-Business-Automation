from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


def utc_now():
    # SQLite stores naive timestamps. All stored values represent UTC.
    return datetime.now(timezone.utc).replace(tzinfo=None)


class RequestRecord(Base):
    __tablename__ = "requests"
    id: Mapped[int] = mapped_column(primary_key=True)
    text: Mapped[str]
    analysis: Mapped[dict] = mapped_column(JSON)
    duration_ms: Mapped[int]
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, index=True)
    demo: Mapped[bool] = mapped_column(default=False)


class Execution(Base):
    __tablename__ = "executions"
    __table_args__ = (Index("ix_executions_status", "status"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[int] = mapped_column(ForeignKey("requests.id"), unique=True)
    name: Mapped[str]
    status: Mapped[str]
    steps: Mapped[list] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[int] = mapped_column(primary_key=True)
    execution_id: Mapped[int] = mapped_column(ForeignKey("executions.id"))
    event: Mapped[str]
    detail: Mapped[str]
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class SeedMarker(Base):
    __tablename__ = "seed_marker"
    id: Mapped[int] = mapped_column(primary_key=True)
