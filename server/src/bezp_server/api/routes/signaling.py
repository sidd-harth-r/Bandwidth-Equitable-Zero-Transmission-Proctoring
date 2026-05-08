from fastapi import APIRouter, Depends, HTTPException, status
from redis import Redis

from bezp_server.api.dependencies import get_rate_limiter, get_redis
from bezp_server.schemas.signaling import SignalAck, SignalEnvelope
from bezp_server.services.rate_limiter import RateLimiter

router = APIRouter(prefix="/signaling", tags=["signaling"])
SIGNAL_TTL_SECONDS = 300


@router.post("", response_model=SignalAck, status_code=status.HTTP_202_ACCEPTED)
def enqueue_signal(
    envelope: SignalEnvelope,
    redis_client: Redis = Depends(get_redis),
    rate_limiter: RateLimiter = Depends(get_rate_limiter),
) -> SignalAck:
    allowed, retry_after_seconds = rate_limiter.allow_signaling_enqueue(envelope.sender_id)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Signaling enqueue rate limit exceeded. Retry after {retry_after_seconds}s.",
        )
    channel = build_channel(
        envelope.session_id,
        envelope.target_id,
        envelope.signal_type,
    )
    pipe = redis_client.pipeline()
    pipe.rpush(channel, envelope.model_dump_json())
    pipe.expire(channel, SIGNAL_TTL_SECONDS)
    pipe.execute()
    return SignalAck(status="queued", channel=channel)


@router.get("/{session_id}/{target_id}/{signal_type}", response_model=SignalEnvelope)
def dequeue_signal(
    session_id: str,
    target_id: str,
    signal_type: str,
    redis_client: Redis = Depends(get_redis),
    rate_limiter: RateLimiter = Depends(get_rate_limiter),
) -> SignalEnvelope:
    if signal_type not in {"offer", "answer", "ice_candidate"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Unsupported signal type.",
        )
    allowed, retry_after_seconds = rate_limiter.allow_signaling_dequeue(target_id)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Signaling dequeue rate limit exceeded. Retry after {retry_after_seconds}s.",
        )
    channel = build_channel(session_id, target_id, signal_type)
    payload = redis_client.lpop(channel)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Signal not found.",
        )
    return SignalEnvelope.model_validate_json(payload)


def build_channel(session_id: str, target_id: str, signal_type: str) -> str:
    return f"bezp:signal:{session_id}:{target_id}:{signal_type}"
