from redis import Redis

from bezp_server.config import Settings


class RateLimiter:
    def __init__(self, redis_client: Redis, settings: Settings) -> None:
        self.redis_client = redis_client
        self.settings = settings

    def allow_ingest(self, student_id: str) -> tuple[bool, int]:
        return self.allow(
            namespace="ingest",
            subject=student_id,
            limit=self.settings.ingest_rate_limit_count,
            window_seconds=self.settings.ingest_rate_limit_window_seconds,
        )

    def allow_signaling_enqueue(self, sender_id: str) -> tuple[bool, int]:
        return self.allow(
            namespace="signaling:enqueue",
            subject=sender_id,
            limit=self.settings.signaling_enqueue_rate_limit_count,
            window_seconds=self.settings.signaling_enqueue_rate_limit_window_seconds,
        )

    def allow_signaling_dequeue(self, target_id: str) -> tuple[bool, int]:
        return self.allow(
            namespace="signaling:dequeue",
            subject=target_id,
            limit=self.settings.signaling_dequeue_rate_limit_count,
            window_seconds=self.settings.signaling_dequeue_rate_limit_window_seconds,
        )

    def allow_session_state_read(self, session_id: str) -> tuple[bool, int]:
        return self.allow(
            namespace="session-state:read",
            subject=session_id,
            limit=self.settings.session_state_read_rate_limit_count,
            window_seconds=self.settings.session_state_read_rate_limit_window_seconds,
        )

    def allow_session_heartbeat(self, session_id: str) -> tuple[bool, int]:
        return self.allow(
            namespace="session:heartbeat",
            subject=session_id,
            limit=self.settings.session_heartbeat_rate_limit_count,
            window_seconds=self.settings.session_heartbeat_rate_limit_window_seconds,
        )

    def allow(
        self,
        namespace: str,
        subject: str,
        limit: int,
        window_seconds: int,
    ) -> tuple[bool, int]:
        key = f"bezp:rate:{namespace}:{subject}"
        pipe = self.redis_client.pipeline()
        pipe.incr(key, 1)
        pipe.ttl(key)
        count, ttl = pipe.execute()

        if ttl == -1:
            self.redis_client.expire(key, window_seconds)
            ttl = window_seconds

        allowed = count <= limit
        return allowed, int(max(ttl, 0))
