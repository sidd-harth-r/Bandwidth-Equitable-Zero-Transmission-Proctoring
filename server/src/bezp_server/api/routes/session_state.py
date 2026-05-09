from fastapi import APIRouter, Depends, HTTPException, status

from bezp_server.api.dependencies import get_rate_limiter, get_session_state_store
from bezp_server.schemas.session_state import SessionHeartbeatIn, SessionStateOut
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
    return build_session_state(data)


@router.post("/{session_id}/heartbeat", response_model=SessionStateOut)
def heartbeat_session(
    session_id: str,
    payload: SessionHeartbeatIn,
    state_store: SessionStateStore = Depends(get_session_state_store),
    rate_limiter: RateLimiter = Depends(get_rate_limiter),
) -> SessionStateOut:
    allowed, retry_after_seconds = rate_limiter.allow_session_heartbeat(session_id)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Session heartbeat rate limit exceeded. Retry after {retry_after_seconds}s.",
        )
    data = state_store.heartbeat(
        session_id=session_id,
        student_id=payload.student_id,
        status=payload.status,
        gear=payload.gear,
    )
    return build_session_state(data)


def build_session_state(data: dict[str, str]) -> SessionStateOut:
    return SessionStateOut(
        session_id=data["session_id"],
        student_id=data["student_id"],
        event_count=int(data.get("event_count", "0")),
        last_tier=data.get("last_tier", "none"),
        last_gear=data.get("last_gear", data.get("current_gear", "gear_1")),
        last_weighted_score=float(data.get("last_weighted_score", "0")),
        last_event_id=data.get("last_event_id", ""),
        last_occurred_at=data.get("last_occurred_at", ""),
        updated_at=data["updated_at"],
        status=data.get("status"),
        current_gear=data.get("current_gear"),
        last_heartbeat_at=data.get("last_heartbeat_at"),
        heartbeat_count=int(data.get("heartbeat_count", "0")),
    )


@router.post("/{session_id}/resume", response_model=SessionStateOut)
def resume_session(
    session_id: str,
    state_store: SessionStateStore = Depends(get_session_state_store),
) -> SessionStateOut:
    data = state_store.get(session_id)
    if data is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session state not found.")
    
    # In a full implementation, we would update the store
    # state_store.update_status(session_id, "ACTIVE")
    # For now, we mock the response
    data["status"] = "ACTIVE"
    return build_session_state(data)
