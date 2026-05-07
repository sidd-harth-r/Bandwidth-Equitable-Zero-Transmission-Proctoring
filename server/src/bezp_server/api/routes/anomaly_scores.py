from fastapi import APIRouter, status

from bezp_server.schemas.anomaly import AnomalyScoreIn, AnomalyScoreOut, SessionSummary
from bezp_server.services.anomaly_store import anomaly_store

router = APIRouter(prefix="/anomaly-scores", tags=["anomaly-scores"])


@router.post("", response_model=AnomalyScoreOut, status_code=status.HTTP_201_CREATED)
def ingest_score(payload: AnomalyScoreIn) -> AnomalyScoreOut:
    return anomaly_store.add(payload)


@router.get("/{session_id}", response_model=SessionSummary)
def get_session_scores(session_id: str) -> SessionSummary:
    return anomaly_store.summary(session_id)
