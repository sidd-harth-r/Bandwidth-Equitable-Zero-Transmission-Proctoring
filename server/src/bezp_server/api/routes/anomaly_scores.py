from fastapi import APIRouter, Depends, HTTPException, status

from bezp_server.api.dependencies import (
    get_anomaly_store,
    get_rate_limiter,
    get_session_cache,
    get_session_state_store,
)
from bezp_server.schemas.anomaly import AnomalyScoreIn, AnomalyScoreOut, SessionSummary
from bezp_server.services.rate_limiter import RateLimiter
from bezp_server.services.session_cache import SessionCache
from bezp_server.services.session_state import SessionStateStore
from bezp_server.services.sql_anomaly_store import SqlAnomalyStore

router = APIRouter(prefix="/anomaly-scores", tags=["anomaly-scores"])


@router.post("", response_model=AnomalyScoreOut, status_code=status.HTTP_201_CREATED)
def ingest_score(
    payload: AnomalyScoreIn,
    anomaly_store: SqlAnomalyStore = Depends(get_anomaly_store),
    session_cache: SessionCache = Depends(get_session_cache),
    session_state_store: SessionStateStore = Depends(get_session_state_store),
    rate_limiter: RateLimiter = Depends(get_rate_limiter),
) -> AnomalyScoreOut:
    allowed, retry_after_seconds = rate_limiter.allow_ingest(payload.student_id)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Ingestion rate limit exceeded. Retry after {retry_after_seconds}s.",
        )
    created = anomaly_store.add(payload)
    session_cache.invalidate_summary(payload.session_id)
    session_state_store.update_from_anomaly(created)
    return created


@router.get("/{session_id}", response_model=SessionSummary)
def get_session_scores(
    session_id: str,
    anomaly_store: SqlAnomalyStore = Depends(get_anomaly_store),
    session_cache: SessionCache = Depends(get_session_cache),
) -> SessionSummary:
    cached_summary = session_cache.get_summary(session_id)
    if cached_summary is not None:
        return cached_summary

    summary = anomaly_store.summary(session_id)
    session_cache.set_summary(summary)
    return summary
