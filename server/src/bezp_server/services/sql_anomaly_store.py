from sqlalchemy import select
from sqlalchemy.orm import Session

from bezp_server.db.models import AnomalyEvent
from bezp_server.schemas.anomaly import AnomalyScoreIn, AnomalyScoreOut, SessionSummary


class SqlAnomalyStore:
    def __init__(self, db: Session) -> None:
        self.db = db

    def add(self, payload: AnomalyScoreIn) -> AnomalyScoreOut:
        event = AnomalyScoreOut(**payload.model_dump())
        model = AnomalyEvent(
            event_id=event.event_id,
            session_id=event.session_id,
            student_id=event.student_id,
            occurred_at=event.occurred_at,
            received_at=event.received_at,
            channel_scores=event.channel_scores.model_dump(),
            agreement_index=event.agreement_index,
            weighted_score=event.weighted_score,
            tier=event.tier.value,
            gear=event.gear.value,
            event_metadata=event.metadata,
        )
        self.db.add(model)
        self.db.commit()
        return event

    def summary(self, session_id: str) -> SessionSummary:
        events = list(
            self.db.scalars(
                select(AnomalyEvent)
                .where(AnomalyEvent.session_id == session_id)
                .order_by(AnomalyEvent.received_at.asc())
            )
        )
        latest = event_to_schema(events[-1]) if events else None
        return SessionSummary(
            session_id=session_id,
            event_count=len(events),
            latest_score=latest,
        )


def event_to_schema(event: AnomalyEvent) -> AnomalyScoreOut:
    return AnomalyScoreOut(
        event_id=event.event_id,
        session_id=event.session_id,
        student_id=event.student_id,
        occurred_at=event.occurred_at,
        received_at=event.received_at,
        channel_scores=event.channel_scores,
        agreement_index=event.agreement_index,
        weighted_score=event.weighted_score,
        tier=event.tier,
        gear=event.gear,
        metadata=event.event_metadata,
    )
