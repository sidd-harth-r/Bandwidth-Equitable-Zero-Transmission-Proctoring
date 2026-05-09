from functools import lru_cache

from pydantic import Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "BEZP API"
    app_env: str = "development"
    api_prefix: str = "/api/v1"
    allowed_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:5174",
            "http://127.0.0.1:5174",
        ]
    )
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "bezp"
    postgres_user: str = "bezp"
    postgres_password: str = "bezp_dev_password"
    database_url: str | None = None
    database_connect_timeout_seconds: int = 5
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_db: int = 0
    redis_session_summary_ttl_seconds: int = 300
    redis_session_state_ttl_seconds: int = 1800
    ingest_rate_limit_count: int = 120
    ingest_rate_limit_window_seconds: int = 60
    signaling_enqueue_rate_limit_count: int = 180
    signaling_enqueue_rate_limit_window_seconds: int = 60
    signaling_dequeue_rate_limit_count: int = 600
    signaling_dequeue_rate_limit_window_seconds: int = 60
    session_state_read_rate_limit_count: int = 240
    session_state_read_rate_limit_window_seconds: int = 60
    session_heartbeat_rate_limit_count: int = 180
    session_heartbeat_rate_limit_window_seconds: int = 60
    admin_api_key: str = Field(default="dev_admin_key", alias="BEZP_ADMIN_API_KEY")

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)

    @computed_field
    @property
    def resolved_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        return (
            f"postgresql+psycopg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
