from collections.abc import Generator

from fastapi import Depends, Request
from redis import Redis
from sqlalchemy.orm import Session

from bezp_server.config import get_settings
from bezp_server.services.session_cache import SessionCache
from bezp_server.services.session_state import SessionStateStore
from bezp_server.services.rate_limiter import RateLimiter
from bezp_server.services.sql_anomaly_store import SqlAnomalyStore


def get_db(request: Request) -> Generator[Session, None, None]:
    database = request.app.state.database
    yield from database.session()


def get_anomaly_store(db: Session = Depends(get_db)) -> SqlAnomalyStore:
    return SqlAnomalyStore(db)


def get_redis(request: Request) -> Redis:
    return request.app.state.redis


def get_session_cache(redis_client: Redis = Depends(get_redis)) -> SessionCache:
    return SessionCache(redis_client, get_settings())


def get_session_state_store(redis_client: Redis = Depends(get_redis)) -> SessionStateStore:
    return SessionStateStore(redis_client, get_settings())


def get_rate_limiter(redis_client: Redis = Depends(get_redis)) -> RateLimiter:
    return RateLimiter(redis_client, get_settings())
