from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from redis import Redis

from bezp_server.api.routes import (
    anomaly_scores, clips, federated, health, interventions,
    reviews, session_history, session_state, signaling,
)
from bezp_server.config import get_settings
from bezp_server.db.session import Database


def create_app() -> FastAPI:
    settings = get_settings()
    database = Database(settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.database = database
        app.state.redis = Redis(
            host=settings.redis_host,
            port=settings.redis_port,
            db=settings.redis_db,
            decode_responses=True,
        )
        database.initialize()
        yield
        app.state.redis.close()

    app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router, prefix=settings.api_prefix)
    app.include_router(anomaly_scores.router, prefix=settings.api_prefix)
    app.include_router(signaling.router, prefix=settings.api_prefix)
    app.include_router(session_state.router, prefix=settings.api_prefix)
    app.include_router(session_history.router, prefix=settings.api_prefix)
    app.include_router(clips.router, prefix=settings.api_prefix)
    app.include_router(reviews.router, prefix=settings.api_prefix)
    app.include_router(interventions.router, prefix=settings.api_prefix)
    app.include_router(federated.router, prefix=settings.api_prefix)

    return app


app = create_app()
