"""
Clip ingestion endpoint.

Receives bounded-quality clip uploads from Tier 2 events.
Stores clip metadata in PostgreSQL and the raw clip binary
on the local filesystem (or object storage in production).
"""

import os
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Header, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from bezp_server.api.dependencies import get_db, get_rate_limiter
from bezp_server.db.models import ClipRecord
from bezp_server.services.rate_limiter import RateLimiter

router = APIRouter(prefix="/clips", tags=["clips"])

# Clip storage directory (local filesystem for dev)
CLIP_STORAGE_DIR = os.environ.get("BEZP_CLIP_STORAGE_DIR", "./clip_storage")


class ClipUploadResponse(BaseModel):
    """Response after successful clip upload."""
    clip_id: str
    session_id: str
    received_at: str
    size_bytes: int


@router.post("/{session_id}", response_model=ClipUploadResponse)
async def upload_clip(
    session_id: str,
    request: Request,
    x_event_id: str = Header(..., alias="X-Event-Id"),
    x_student_id: str = Header(..., alias="X-Student-Id"),
    db: Session = Depends(get_db),
    rate_limiter: RateLimiter = Depends(get_rate_limiter),
) -> ClipUploadResponse:
    """
    Receive a clip upload for a Tier 2 event.

    The clip is a binary blob containing a JSON header followed
    by raw frame pixel data. We store it as-is and record metadata
    in PostgreSQL.
    """
    allowed, retry_after_seconds = rate_limiter.allow_ingest(session_id)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Clip upload rate limit exceeded. Retry after {retry_after_seconds}s.",
        )

    # Read the raw body
    body = await request.body()
    if len(body) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty clip body.",
        )

    # Size limit: 50MB
    if len(body) > 50 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Clip exceeds 50MB size limit.",
        )

    clip_id = str(uuid4())
    now = datetime.now(timezone.utc)

    # Ensure storage directory exists
    os.makedirs(CLIP_STORAGE_DIR, exist_ok=True)

    # Write clip to filesystem
    storage_path = os.path.join(CLIP_STORAGE_DIR, f"{clip_id}.bin")
    with open(storage_path, "wb") as f:
        f.write(body)

    # Store metadata in PostgreSQL
    clip_record = ClipRecord(
        clip_id=clip_id,
        session_id=session_id,
        student_id=x_student_id,
        event_id=x_event_id,
        received_at=now,
        size_bytes=len(body),
        storage_path=storage_path,
        tier="tier_2",
        reviewed=False,
    )
    db.add(clip_record)
    db.commit()

    return ClipUploadResponse(
        clip_id=clip_id,
        session_id=session_id,
        received_at=now.isoformat(),
        size_bytes=len(body),
    )
