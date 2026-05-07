from datetime import datetime

from sqlalchemy import DateTime, Float, Index, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class AnomalyEvent(Base):
    __tablename__ = "anomaly_events"
    __table_args__ = (
        Index("ix_anomaly_events_session_received", "session_id", "received_at"),
    )

    event_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    student_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    channel_scores: Mapped[dict[str, float]] = mapped_column(JSONB, nullable=False)
    agreement_index: Mapped[float] = mapped_column(Float, nullable=False)
    weighted_score: Mapped[float] = mapped_column(Float, nullable=False)
    tier: Mapped[str] = mapped_column(String(32), nullable=False)
    gear: Mapped[str] = mapped_column(String(32), nullable=False)
    event_metadata: Mapped[dict[str, str]] = mapped_column(JSONB, nullable=False, default=dict)
