"""
Review decisions API.

Allows proctors to submit verdicts on Tier 2 clips, retrieve
review queues, and query verified labels for FL training.
"""

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from bezp_server.api.dependencies import get_db, get_rate_limiter
from bezp_server.db.models import AnomalyEvent, ClipRecord, ReviewDecision
from bezp_server.services.rate_limiter import RateLimiter

router = APIRouter(prefix="/reviews", tags=["reviews"])


# ── Request / Response Schemas ──────────────────────────────


class ReviewSubmission(BaseModel):
    """Proctor's decision on a clip."""
    clip_id: str
    reviewer_id: str
    verdict: str = Field(..., pattern=r"^(suspicious|not_suspicious|escalate)$")
    confidence: float = Field(1.0, ge=0.0, le=1.0)
    notes: str = ""


class ReviewResponse(BaseModel):
    decision_id: str
    clip_id: str
    session_id: str
    student_id: str
    event_id: str
    reviewer_id: str
    verdict: str
    confidence: float
    notes: str
    decided_at: str
    fl_weight: float


class ReviewQueueItem(BaseModel):
    clip_id: str
    session_id: str
    student_id: str
    event_id: str
    received_at: str
    size_bytes: int
    tier: str
    reviewed: bool
    weighted_score: float | None = None
    channel_scores: dict[str, float] | None = None


class ReviewQueueResponse(BaseModel):
    items: list[ReviewQueueItem]
    total: int
    pending: int


class VerifiedLabel(BaseModel):
    """Label suitable for FL training pipeline."""
    event_id: str
    session_id: str
    student_id: str
    verdict: str
    fl_weight: float
    channel_scores: dict[str, float]
    weighted_score: float
    decided_at: str


class VerifiedLabelsResponse(BaseModel):
    labels: list[VerifiedLabel]
    total: int


# ── Routes ──────────────────────────────────────────────────


@router.post("", response_model=ReviewResponse, status_code=status.HTTP_201_CREATED)
def submit_review(
    submission: ReviewSubmission,
    db: Session = Depends(get_db),
    rate_limiter: RateLimiter = Depends(get_rate_limiter),
) -> ReviewResponse:
    """Submit a review decision for a clip."""
    # Validate clip exists
    clip = db.query(ClipRecord).filter(ClipRecord.clip_id == submission.clip_id).first()
    if not clip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Clip {submission.clip_id} not found.",
        )

    # Check for duplicate review
    existing = (
        db.query(ReviewDecision)
        .filter(
            ReviewDecision.clip_id == submission.clip_id,
            ReviewDecision.reviewer_id == submission.reviewer_id,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This reviewer has already submitted a decision for this clip.",
        )

    now = datetime.now(timezone.utc)
    decision_id = str(uuid4())

    decision = ReviewDecision(
        decision_id=decision_id,
        clip_id=submission.clip_id,
        session_id=clip.session_id,
        student_id=clip.student_id,
        event_id=clip.event_id,
        reviewer_id=submission.reviewer_id,
        verdict=submission.verdict,
        confidence=submission.confidence,
        notes=submission.notes,
        decided_at=now,
        fl_weight=10.0,  # Verified labels get 10x weight
        decision_metadata={},
    )

    db.add(decision)

    # Mark clip as reviewed
    clip.reviewed = True
    db.commit()

    return ReviewResponse(
        decision_id=decision_id,
        clip_id=submission.clip_id,
        session_id=clip.session_id,
        student_id=clip.student_id,
        event_id=clip.event_id,
        reviewer_id=submission.reviewer_id,
        verdict=submission.verdict,
        confidence=submission.confidence,
        notes=submission.notes,
        decided_at=now.isoformat(),
        fl_weight=10.0,
    )


@router.get("/queue", response_model=ReviewQueueResponse)
def get_review_queue(
    reviewed: bool = Query(False, description="Include already-reviewed clips"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> ReviewQueueResponse:
    """Get the review queue sorted by severity (highest weighted_score first)."""
    query = db.query(ClipRecord)

    if not reviewed:
        query = query.filter(ClipRecord.reviewed == False)  # noqa: E712

    total = query.count()

    # Join with anomaly events for scoring info
    clips = (
        query
        .outerjoin(AnomalyEvent, AnomalyEvent.event_id == ClipRecord.event_id)
        .order_by(desc(AnomalyEvent.weighted_score))
        .offset(offset)
        .limit(limit)
        .all()
    )

    items: list[ReviewQueueItem] = []
    for clip in clips:
        # Look up the corresponding anomaly event for scoring
        event = (
            db.query(AnomalyEvent)
            .filter(AnomalyEvent.event_id == clip.event_id)
            .first()
        )

        items.append(
            ReviewQueueItem(
                clip_id=clip.clip_id,
                session_id=clip.session_id,
                student_id=clip.student_id,
                event_id=clip.event_id,
                received_at=clip.received_at.isoformat(),
                size_bytes=clip.size_bytes,
                tier=clip.tier,
                reviewed=clip.reviewed,
                weighted_score=event.weighted_score if event else None,
                channel_scores=event.channel_scores if event else None,
            )
        )

    pending_count = db.query(ClipRecord).filter(ClipRecord.reviewed == False).count()  # noqa: E712

    return ReviewQueueResponse(items=items, total=total, pending=pending_count)


@router.get("/labels", response_model=VerifiedLabelsResponse)
def get_verified_labels(
    limit: int = Query(500, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> VerifiedLabelsResponse:
    """
    Retrieve verified labels for the FL training pipeline.
    Returns decisions joined with anomaly event scores.
    """
    decisions = (
        db.query(ReviewDecision)
        .order_by(desc(ReviewDecision.decided_at))
        .offset(offset)
        .limit(limit)
        .all()
    )

    labels: list[VerifiedLabel] = []
    for decision in decisions:
        event = (
            db.query(AnomalyEvent)
            .filter(AnomalyEvent.event_id == decision.event_id)
            .first()
        )

        labels.append(
            VerifiedLabel(
                event_id=decision.event_id,
                session_id=decision.session_id,
                student_id=decision.student_id,
                verdict=decision.verdict,
                fl_weight=decision.fl_weight,
                channel_scores=event.channel_scores if event else {},
                weighted_score=event.weighted_score if event else 0.0,
                decided_at=decision.decided_at.isoformat(),
            )
        )

    total = db.query(func.count(ReviewDecision.decision_id)).scalar() or 0

    return VerifiedLabelsResponse(labels=labels, total=total)


@router.get("/{clip_id}", response_model=list[ReviewResponse])
def get_reviews_for_clip(
    clip_id: str,
    db: Session = Depends(get_db),
) -> list[ReviewResponse]:
    """Get all review decisions for a specific clip."""
    decisions = (
        db.query(ReviewDecision)
        .filter(ReviewDecision.clip_id == clip_id)
        .order_by(desc(ReviewDecision.decided_at))
        .all()
    )

    return [
        ReviewResponse(
            decision_id=d.decision_id,
            clip_id=d.clip_id,
            session_id=d.session_id,
            student_id=d.student_id,
            event_id=d.event_id,
            reviewer_id=d.reviewer_id,
            verdict=d.verdict,
            confidence=d.confidence,
            notes=d.notes,
            decided_at=d.decided_at.isoformat(),
            fl_weight=d.fl_weight,
        )
        for d in decisions
    ]
