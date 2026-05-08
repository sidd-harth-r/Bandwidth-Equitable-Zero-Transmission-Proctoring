from datetime import datetime, timezone

from redis import Redis

from bezp_server.config import Settings
from bezp_server.schemas.anomaly import AnomalyScoreOut


class SessionStateStore:
    def __init__(self, redis_client: Redis, settings: Settings) -> None:
        self.redis_client = redis_client
        self.settings = settings

    def update_from_anomaly(self, payload: AnomalyScoreOut) -> None:
        key = f"bezp:session-state:{payload.session_id}"
        now = datetime.now(timezone.utc).isoformat()
        pipe = self.redis_client.pipeline()
        pipe.hset(
            key,
            mapping={
                "session_id": payload.session_id,
                "student_id": payload.student_id,
                "status": "active",
                "current_gear": payload.gear,
                "last_tier": payload.tier,
                "last_gear": payload.gear,
                "last_weighted_score": str(payload.weighted_score),
                "last_event_id": payload.event_id,
                "last_occurred_at": payload.occurred_at.isoformat(),
                "updated_at": now,
            },
        )
        pipe.hincrby(key, "event_count", 1)
        pipe.expire(key, self.settings.redis_session_state_ttl_seconds)
        pipe.execute()

    def heartbeat(self, session_id: str, student_id: str, status: str, gear: str) -> dict[str, str]:
        key = f"bezp:session-state:{session_id}"
        now = datetime.now(timezone.utc).isoformat()
        pipe = self.redis_client.pipeline()
        pipe.hset(
            key,
            mapping={
                "session_id": session_id,
                "student_id": student_id,
                "status": status,
                "current_gear": gear,
                "updated_at": now,
                "last_heartbeat_at": now,
            },
        )
        pipe.hsetnx(key, "event_count", "0")
        pipe.hsetnx(key, "heartbeat_count", "0")
        pipe.hincrby(key, "heartbeat_count", 1)
        pipe.expire(key, self.settings.redis_session_state_ttl_seconds)
        pipe.execute()
        data = self.get(session_id)
        if data is None:
            raise RuntimeError("Session heartbeat write did not produce session state.")
        return data

    def get(self, session_id: str) -> dict[str, str] | None:
        key = f"bezp:session-state:{session_id}"
        data = self.redis_client.hgetall(key)
        if not data:
            return None
        return {k: v for k, v in data.items()}
