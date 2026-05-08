import json

from redis import Redis

from bezp_server.config import Settings
from bezp_server.schemas.anomaly import SessionSummary


class SessionCache:
    def __init__(self, client: Redis, settings: Settings) -> None:
        self.client = client
        self.settings = settings

    def get_summary(self, session_id: str) -> SessionSummary | None:
        raw = self.client.get(self._summary_key(session_id))
        if raw is None:
            return None
        return SessionSummary.model_validate_json(raw)

    def set_summary(self, summary: SessionSummary) -> None:
        self.client.setex(
            self._summary_key(summary.session_id),
            self.settings.redis_session_summary_ttl_seconds,
            summary.model_dump_json(),
        )

    def invalidate_summary(self, session_id: str) -> None:
        self.client.delete(self._summary_key(session_id))

    def _summary_key(self, session_id: str) -> str:
        return f"bezp:session-summary:{session_id}"
