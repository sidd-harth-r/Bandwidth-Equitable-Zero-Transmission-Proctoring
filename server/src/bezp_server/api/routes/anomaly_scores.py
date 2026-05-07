from fastapi import APIRouter, Depends, status

from bezp_server.api.dependencies import get_anomaly_store
from bezp_server.schemas.anomaly import AnomalyScoreIn, AnomalyScoreOut, SessionSummary
from bezp_server.services.sql_anomaly_store import SqlAnomalyStore

router = APIRouter(prefix="/anomaly-scores", tags=["anomaly-scores"])


@router.post("", response_model=AnomalyScoreOut, status_code=status.HTTP_201_CREATED)
def ingest_score(
    payload: AnomalyScoreIn,
    anomaly_store: SqlAnomalyStore = Depends(get_anomaly_store),
) -> AnomalyScoreOut:
    return anomaly_store.add(payload)


@router.get("/{session_id}", response_model=SessionSummary)
def get_session_scores(
    session_id: str,
    anomaly_store: SqlAnomalyStore = Depends(get_anomaly_store),
) -> SessionSummary:
    return anomaly_store.summary(session_id)
