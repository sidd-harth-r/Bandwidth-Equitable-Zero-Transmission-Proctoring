from collections import defaultdict
from threading import Lock

from bezp_server.schemas.anomaly import AnomalyScoreIn, AnomalyScoreOut, SessionSummary


class InMemoryAnomalyStore:
    def __init__(self) -> None:
        self._events: dict[str, list[AnomalyScoreOut]] = defaultdict(list)
        self._lock = Lock()

    def add(self, payload: AnomalyScoreIn) -> AnomalyScoreOut:
        event = AnomalyScoreOut(**payload.model_dump())
        with self._lock:
            self._events[event.session_id].append(event)
        return event

    def summary(self, session_id: str) -> SessionSummary:
        with self._lock:
            events = list(self._events.get(session_id, []))
        return SessionSummary(
            session_id=session_id,
            event_count=len(events),
            latest_score=events[-1] if events else None,
        )

    def clear(self) -> None:
        with self._lock:
            self._events.clear()


anomaly_store = InMemoryAnomalyStore()
