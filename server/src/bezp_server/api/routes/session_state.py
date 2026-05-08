from fastapi import APIRouter, Depends, HTTPException, status

from bezp_server.api.dependencies import get_rate_limiter, get_session_state_store
from bezp_server.schemas.session_state import SessionStateOut
from bezp_server.services.rate_limiter import RateLimiter
from bezp_server.services.session_state import SessionStateStore

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("/{session_id}/state", response_model=SessionStateOut)
def get_session_state(
    session_id: str,
    state_store: SessionStateStore = Depends(get_session_state_store),
    rate_limiter: RateLimiter = Depends(get_rate_limiter),
) -> SessionStateOut:
    allowed, retry_after_seconds = rate_limiter.allow_session_state_read(session_id)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Session state read rate limit exceeded. Retry after {retry_after_seconds}s.",
        )
    data = state_store.get(session_id)
    if data is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session state not found.")
    return SessionStateOut(
        session_id=data["session_id"],
        student_id=data["student_id"],
        event_count=int(data["event_count"]),
        last_tier=data["last_tier"],
        last_gear=data["last_gear"],
        last_weighted_score=float(data["last_weighted_score"]),
        last_event_id=data["last_event_id"],
        last_occurred_at=data["last_occurred_at"],
        updated_at=data["updated_at"],
    )
