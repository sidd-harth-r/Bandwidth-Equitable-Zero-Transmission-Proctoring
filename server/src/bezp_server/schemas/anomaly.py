from datetime import datetime, timezone
from enum import Enum
from typing import Dict
from uuid import uuid4

from pydantic import BaseModel, Field, validator


class Gear(str, Enum):
    gear_1 = "gear_1"
    gear_2 = "gear_2"
    gear_3 = "gear_3"
    gear_4 = "gear_4"


class Tier(str, Enum):
    tier_1 = "tier_1"
    tier_2 = "tier_2"
    tier_3 = "tier_3"


class ChannelScores(BaseModel):
    pose_gaze: float = Field(..., ge=0.0, le=1.0)
    rppg: float = Field(0.0, ge=0.0, le=1.0)
    au: float = Field(0.0, ge=0.0, le=1.0)
    keystroke: float = Field(0.0, ge=0.0, le=1.0)


class AnomalyScoreIn(BaseModel):
    session_id: str = Field(..., min_length=1, max_length=128)
    student_id: str = Field(..., min_length=1, max_length=128)
    occurred_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    channel_scores: ChannelScores
    agreement_index: float = Field(..., ge=0.0, le=0.5)
    weighted_score: float = Field(..., ge=0.0, le=1.0)
    tier: Tier
    gear: Gear
    metadata: Dict[str, str] = Field(default_factory=dict)

    @validator("occurred_at")
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value


class AnomalyScoreOut(AnomalyScoreIn):
    event_id: str = Field(default_factory=lambda: str(uuid4()))
    received_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SessionSummary(BaseModel):
    session_id: str
    event_count: int
    latest_score: AnomalyScoreOut | None = None
