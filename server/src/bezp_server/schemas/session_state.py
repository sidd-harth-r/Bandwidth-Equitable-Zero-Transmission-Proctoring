from pydantic import BaseModel


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
