from pydantic import BaseModel


class SessionHeartbeatIn(BaseModel):
    student_id: str
    status: str = "active"
    gear: str = "gear_1"


class SessionStateOut(BaseModel):
    session_id: str
    student_id: str
    event_count: int
    last_tier: str
    last_gear: str
    last_weighted_score: float
    last_event_id: str
    last_occurred_at: str
    updated_at: str
    status: str | None = None
    current_gear: str | None = None
    last_heartbeat_at: str | None = None
    heartbeat_count: int = 0
