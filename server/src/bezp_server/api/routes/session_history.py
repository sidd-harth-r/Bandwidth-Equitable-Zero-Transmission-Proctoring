"""
Session-history prior endpoint.

Returns aggregated statistics from previous sessions for a given student,
which the client uses to pre-adjust fusion weights and tier thresholds.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from bezp_server.api.dependencies import get_anomaly_store, get_rate_limiter
from bezp_server.services.rate_limiter import RateLimiter
from bezp_server.services.sql_anomaly_store import SqlAnomalyStore

router = APIRouter(prefix="/session-history", tags=["session-history"])


class ChannelPrior(BaseModel):
    """Per-channel historical statistics for one student."""
    mean_score: float = Field(0.0, ge=0.0, le=1.0)
    max_score: float = Field(0.0, ge=0.0, le=1.0)
    std_dev: float = Field(0.0, ge=0.0)
    event_count: int = Field(0, ge=0)


class SessionHistoryPrior(BaseModel):
    """Aggregated prior statistics for threshold adjustment."""
    student_id: str
    total_sessions: int = 0
    total_events: int = 0
    mean_weighted_score: float = Field(0.0, ge=0.0, le=1.0)
    mean_agreement_index: float = Field(0.0, ge=0.0, le=0.5)
    tier1_rate: float = Field(0.0, ge=0.0, le=1.0)
    tier2_rate: float = Field(0.0, ge=0.0, le=1.0)
    channel_priors: dict[str, ChannelPrior] = Field(default_factory=dict)
    suggested_threshold_adjustment: float = Field(
        0.0,
        description="Positive = raise thresholds (student has high baseline), "
        "Negative = lower thresholds (student has low baseline)",
    )


@router.get("/{student_id}", response_model=SessionHistoryPrior)
def get_session_history(
    student_id: str,
    anomaly_store: SqlAnomalyStore = Depends(get_anomaly_store),
    rate_limiter: RateLimiter = Depends(get_rate_limiter),
) -> SessionHistoryPrior:
    allowed, retry_after_seconds = rate_limiter.allow_session_state_read(student_id)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Session history rate limit exceeded. Retry after {retry_after_seconds}s.",
        )
    return anomaly_store.student_prior(student_id)
