from redis import Redis

from bezp_server.config import Settings


class RateLimiter:
    def __init__(self, redis_client: Redis, settings: Settings) -> None:
        self.redis_client = redis_client
        self.settings = settings

    def allow_ingest(self, student_id: str) -> tuple[bool, int]:
        key = f"bezp:rate:ingest:{student_id}"
        pipe = self.redis_client.pipeline()
        pipe.incr(key, 1)
        pipe.ttl(key)
        count, ttl = pipe.execute()

        if ttl == -1:
            self.redis_client.expire(key, self.settings.ingest_rate_limit_window_seconds)
            ttl = self.settings.ingest_rate_limit_window_seconds

        allowed = count <= self.settings.ingest_rate_limit_count
        return allowed, int(max(ttl, 0))
