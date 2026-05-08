from fastapi import APIRouter, Depends, status

from bezp_server.api.dependencies import get_anomaly_store, get_session_cache
from bezp_server.schemas.anomaly import AnomalyScoreIn, AnomalyScoreOut, SessionSummary
from bezp_server.services.session_cache import SessionCache
from bezp_server.services.sql_anomaly_store import SqlAnomalyStore

router = APIRouter(prefix="/anomaly-scores", tags=["anomaly-scores"])


@router.post("", response_model=AnomalyScoreOut, status_code=status.HTTP_201_CREATED)
def ingest_score(
    payload: AnomalyScoreIn,
    anomaly_store: SqlAnomalyStore = Depends(get_anomaly_store),
    session_cache: SessionCache = Depends(get_session_cache),
) -> AnomalyScoreOut:
    created = anomaly_store.add(payload)
    session_cache.invalidate_summary(payload.session_id)
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
