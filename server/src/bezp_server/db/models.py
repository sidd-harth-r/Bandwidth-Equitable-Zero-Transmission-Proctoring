from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Index, Integer, String, Text
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


class ClipRecord(Base):
    """Metadata for Tier 2 clip uploads. The actual binary is on disk/object storage."""
    __tablename__ = "clip_records"
    __table_args__ = (
        Index("ix_clip_records_session", "session_id"),
    )

    clip_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_id: Mapped[str] = mapped_column(String(128), nullable=False)
    student_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    event_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_path: Mapped[str] = mapped_column(String(512), nullable=False)
    tier: Mapped[str] = mapped_column(String(32), nullable=False, default="tier_2")
    reviewed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class ReviewDecision(Base):
    """
    Reviewer decisions on Tier 2 clips.
    Stores the verdict with FL weighting metadata (verified labels
    receive 10x weight during federated training).
    """
    __tablename__ = "review_decisions"
    __table_args__ = (
        Index("ix_review_decisions_session", "session_id"),
        Index("ix_review_decisions_reviewer", "reviewer_id"),
    )

    decision_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    clip_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    session_id: Mapped[str] = mapped_column(String(128), nullable=False)
    student_id: Mapped[str] = mapped_column(String(128), nullable=False)
    event_id: Mapped[str] = mapped_column(String(64), nullable=False)
    reviewer_id: Mapped[str] = mapped_column(String(128), nullable=False)
    verdict: Mapped[str] = mapped_column(String(32), nullable=False)  # suspicious | not_suspicious | escalate
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    notes: Mapped[str] = mapped_column(Text, nullable=False, default="")
    decided_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    fl_weight: Mapped[float] = mapped_column(Float, nullable=False, default=10.0)  # 10x for verified labels
    decision_metadata: Mapped[dict[str, str]] = mapped_column(JSONB, nullable=False, default=dict)

