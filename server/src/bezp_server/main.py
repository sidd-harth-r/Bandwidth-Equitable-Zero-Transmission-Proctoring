from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from bezp_server.api.routes import anomaly_scores, health
from bezp_server.config import get_settings
from bezp_server.db.session import Database


def create_app() -> FastAPI:
    settings = get_settings()
    database = Database(settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.database = database
        database.initialize()
        yield

    app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router, prefix=settings.api_prefix)
    app.include_router(anomaly_scores.router, prefix=settings.api_prefix)

    return app


app = create_app()
