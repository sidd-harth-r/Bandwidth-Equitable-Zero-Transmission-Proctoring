"""
Intervention messaging API.

Enables proctors to send neutral intervention messages to
exam-taker clients via a Redis-backed message queue.

Messages are neutral: they do NOT reveal that the proctor has
seen video/audio. Example messages: "Please look at the camera"
or "Your exam environment has changed."

Privacy: Messages are text-only. No video/audio is shared
from proctor to student.
"""

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from redis import Redis

from bezp_server.api.dependencies import get_redis, get_rate_limiter
from bezp_server.services.rate_limiter import RateLimiter

router = APIRouter(prefix="/interventions", tags=["interventions"])

# Redis key prefix
INTERVENTION_QUEUE_PREFIX = "bezp:interventions:"
INTERVENTION_TTL_SECONDS = 300  # Messages expire after 5 minutes


# ── Schemas ─────────────────────────────────────────────────


class InterventionMessage(BaseModel):
    """Intervention message from proctor to student."""
    session_id: str
    sender_id: str
    message_type: str = Field(
        ...,
        pattern=r"^(look_at_camera|environment_change|general_warning|check_audio|identity_check)$",
    )
    custom_text: str = Field("", max_length=500)


class InterventionResponse(BaseModel):
    message_id: str
    session_id: str
    message_type: str
    custom_text: str
    sent_at: str


class PendingIntervention(BaseModel):
    message_id: str
    message_type: str
    custom_text: str
    sent_at: str


# ── Predefined neutral messages ─────────────────────────────

NEUTRAL_MESSAGES = {
    "look_at_camera": "Please ensure you are looking at the camera.",
    "environment_change": "Your exam environment appears to have changed. Please verify your setup.",
    "general_warning": "A reminder to follow the exam guidelines.",
    "check_audio": "Please ensure your microphone is working properly.",
    "identity_check": "Please confirm your identity by looking directly at the camera.",
}


# ── Routes ──────────────────────────────────────────────────


@router.post("", response_model=InterventionResponse, status_code=status.HTTP_201_CREATED)
def send_intervention(
    message: InterventionMessage,
    redis_client: Redis = Depends(get_redis),
    rate_limiter: RateLimiter = Depends(get_rate_limiter),
) -> InterventionResponse:
    """Send an intervention message to a student session."""
    allowed, retry_after = rate_limiter.allow_ingest(f"intervention:{message.session_id}")
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Intervention rate limit exceeded. Retry after {retry_after}s.",
        )

    message_id = str(uuid4())
    now = datetime.now(timezone.utc)

    # Build the display text
    display_text = message.custom_text or NEUTRAL_MESSAGES.get(
        message.message_type, "Please follow exam guidelines."
    )

    # Push to Redis list for the session
    queue_key = f"{INTERVENTION_QUEUE_PREFIX}{message.session_id}"
    import json
    intervention_data = json.dumps({
        "message_id": message_id,
        "message_type": message.message_type,
        "custom_text": display_text,
        "sent_at": now.isoformat(),
        "sender_id": message.sender_id,
    })

    redis_client.rpush(queue_key, intervention_data)
    redis_client.expire(queue_key, INTERVENTION_TTL_SECONDS)

    return InterventionResponse(
        message_id=message_id,
        session_id=message.session_id,
        message_type=message.message_type,
        custom_text=display_text,
        sent_at=now.isoformat(),
    )


@router.get("/{session_id}", response_model=list[PendingIntervention])
def poll_interventions(
    session_id: str,
    redis_client: Redis = Depends(get_redis),
) -> list[PendingIntervention]:
    """
    Poll for pending intervention messages for a session.
    Returns and clears all pending messages (client-pull pattern).
    """
    queue_key = f"{INTERVENTION_QUEUE_PREFIX}{session_id}"

    # Pop all pending messages
    messages: list[PendingIntervention] = []
    import json

    while True:
        raw = redis_client.lpop(queue_key)
        if raw is None:
            break
        data = json.loads(raw)
        messages.append(
            PendingIntervention(
                message_id=data["message_id"],
                message_type=data["message_type"],
                custom_text=data["custom_text"],
                sent_at=data["sent_at"],
            )
        )

    return messages
