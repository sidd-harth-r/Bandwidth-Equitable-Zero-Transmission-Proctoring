import math

from sqlalchemy import func, select
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

    def student_prior(self, student_id: str) -> "SessionHistoryPrior":
        """Aggregate historical anomaly data for a student across all sessions."""
        from bezp_server.api.routes.session_history import (
            ChannelPrior,
            SessionHistoryPrior,
        )

        events = list(
            self.db.scalars(
                select(AnomalyEvent)
                .where(AnomalyEvent.student_id == student_id)
                .order_by(AnomalyEvent.received_at.asc())
            )
        )

        if not events:
            return SessionHistoryPrior(student_id=student_id)

        session_ids = set(e.session_id for e in events)
        total_events = len(events)

        # Aggregate weighted scores
        weighted_scores = [e.weighted_score for e in events]
        agreement_indices = [e.agreement_index for e in events]
        mean_weighted = sum(weighted_scores) / total_events
        mean_agreement = sum(agreement_indices) / total_events

        # Tier rates
        tier1_count = sum(1 for e in events if e.tier == "tier_1")
        tier2_count = sum(1 for e in events if e.tier == "tier_2")
        tier1_rate = tier1_count / total_events
        tier2_rate = tier2_count / total_events

        # Per-channel priors
        channel_names = ["pose_gaze", "rppg", "au", "keystroke"]
        channel_priors: dict[str, ChannelPrior] = {}

        for ch in channel_names:
            ch_scores = [
                e.channel_scores.get(ch, 0.0)
                for e in events
                if isinstance(e.channel_scores, dict)
            ]
            if ch_scores:
                ch_mean = sum(ch_scores) / len(ch_scores)
                ch_max = max(ch_scores)
                ch_var = sum((s - ch_mean) ** 2 for s in ch_scores) / len(ch_scores)
                ch_std = math.sqrt(ch_var)
                channel_priors[ch] = ChannelPrior(
                    mean_score=round(ch_mean, 4),
                    max_score=round(ch_max, 4),
                    std_dev=round(ch_std, 4),
                    event_count=len(ch_scores),
                )
            else:
                channel_priors[ch] = ChannelPrior()

        # Suggested threshold adjustment:
        # If student historically scores high (>0.3 mean), raise thresholds
        # to reduce false positives. If low (<0.1), lower thresholds.
        adjustment = 0.0
        if mean_weighted > 0.3:
            adjustment = min(0.1, (mean_weighted - 0.3) * 0.5)
        elif mean_weighted < 0.1:
            adjustment = max(-0.1, (mean_weighted - 0.1) * 0.5)

        return SessionHistoryPrior(
            student_id=student_id,
            total_sessions=len(session_ids),
            total_events=total_events,
            mean_weighted_score=round(mean_weighted, 4),
            mean_agreement_index=round(mean_agreement, 4),
            tier1_rate=round(tier1_rate, 4),
            tier2_rate=round(tier2_rate, 4),
            channel_priors=channel_priors,
            suggested_threshold_adjustment=round(adjustment, 4),
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
