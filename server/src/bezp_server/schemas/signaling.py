from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field


class SignalEnvelope(BaseModel):
    session_id: str = Field(..., min_length=1, max_length=128)
    sender_id: str = Field(..., min_length=1, max_length=128)
    target_id: str = Field(..., min_length=1, max_length=128)
    signal_type: Literal["offer", "answer", "ice_candidate"]
    payload: str = Field(..., min_length=1)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SignalAck(BaseModel):
    status: Literal["queued"]
    channel: str
