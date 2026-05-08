from collections.abc import Generator
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session, sessionmaker

from bezp_server.config import Settings


class Database:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.engine = create_engine(
            settings.resolved_database_url,
            pool_pre_ping=True,
            connect_args={"connect_timeout": settings.database_connect_timeout_seconds},
        )
        self.session_factory = sessionmaker(bind=self.engine, expire_on_commit=False)

    def initialize(self) -> None:
        with self.engine.begin() as connection:
            connection.execute(text("CREATE EXTENSION IF NOT EXISTS timescaledb"))
        self.run_migrations()

    def run_migrations(self) -> None:
        alembic_config = Config(str(self._alembic_ini_path()))
        alembic_config.set_main_option("sqlalchemy.url", self.settings.resolved_database_url)
        if self._needs_legacy_baseline_stamp():
            command.stamp(alembic_config, "head")
            return
        command.upgrade(alembic_config, "head")

    def _alembic_ini_path(self) -> Path:
        return Path(__file__).resolve().parents[3] / "alembic.ini"

    def _needs_legacy_baseline_stamp(self) -> bool:
        inspector = inspect(self.engine)
        tables = set(inspector.get_table_names())
        return "anomaly_events" in tables and "alembic_version" not in tables

    def session(self) -> Generator[Session, None, None]:
        db = self.session_factory()
        try:
            yield db
        finally:
            db.close()
