"""
FastAPI endpoints for Federated Learning.

Handles distribution of the global model and ingestion of
privatized local gradients from the exam clients.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel, Field

from bezp_server.api.dependencies import get_rate_limiter, get_redis
from bezp_server.services.rate_limiter import RateLimiter
from bezp_server.ml.GradientDeserializer import GradientDeserializer
from bezp_server.ml.FlowerBrowserClientAdapter import FlowerBrowserClientAdapter
from redis import Redis

router = APIRouter(prefix="/federated", tags=["federated"])


# ── Schemas ─────────────────────────────────────────────────

class GradientPayload(BaseModel):
    """
    Schema for serialized gradient uploads from the client.
    """
    session_id: str
    student_id: str
    model_version: int
    gear_at_submission: int = Field(..., ge=1, le=4)
    quantised: bool
    delta_indices: list[int]
    delta_values: str  # Base64-encoded Float32Array (or Uint8Array if quantised)
    dp_sigma: float
    sample_count: int
    timestamp: int  # Unix milliseconds


class RollbackRequest(BaseModel):
    target_version: int

# ── Dependencies ──────────────────────────────────────────

from fastapi import Header
from bezp_server.config import get_settings
from bezp_server.api.dependencies import get_db, get_redis
from bezp_server.services.ModelRollbackService import ModelRollbackService
from sqlalchemy.orm import Session

async def verify_admin_key(x_admin_key: str = Header(...)):
    settings = get_settings()
    if x_admin_key != settings.admin_api_key:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid admin API key"
        )

# ── Routes ──────────────────────────────────────────────────

@router.post("/rollback", status_code=status.HTTP_200_OK, dependencies=[Depends(verify_admin_key)])
async def rollback_model(
    req: RollbackRequest,
    db: Session = Depends(get_db),
    redis_client: Redis = Depends(get_redis),
    rate_limiter: RateLimiter = Depends(get_rate_limiter)
):
    """
    Rollback the global model to a specific version.
    Protected by X-Admin-Key and rate limited to 5 per hour.
    """
    # Rate limit check (5 per hour)
    allowed, retry_after = rate_limiter.allow(
        namespace="admin",
        subject="rollback",
        limit=5,
        window_seconds=3600
    )
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rollback rate limit exceeded. Retry after {retry_after}s."
        )

    service = ModelRollbackService(db, redis_client)
    try:
        version = service.rollback_to_version(req.target_version)
        return {
            "status": "success",
            "message": f"Rolled back to version {version.version}",
            "version": version.version,
            "precision": version.precision,
            "recall": version.recall
        }
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@router.get("/model/history", dependencies=[Depends(verify_admin_key)])
async def get_model_history(db: Session = Depends(get_db), redis_client: Redis = Depends(get_redis)):
    service = ModelRollbackService(db, redis_client)
    history = service.get_version_history()
    return [
        {
            "version": v.version,
            "created_at": v.created_at,
            "precision": v.precision,
            "recall": v.recall,
            "num_gradients": v.num_gradients,
            "status": v.status
        }
        for v in history
    ]

@router.post("/gradients", status_code=status.HTTP_202_ACCEPTED)
async def upload_gradients(
    payload: GradientPayload,
    rate_limiter: RateLimiter = Depends(get_rate_limiter),
    redis_client: Redis = Depends(get_redis)
):

    """
    Receive privatized local gradients from a client after exam completion.
    The payload is deserialized and handed off to the Flower server via Redis.
    """
    allowed, retry_after = rate_limiter.allow_ingest(f"grad:{payload.session_id}")
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded. Retry after {retry_after}s.",
        )

    try:
        # 1. Deserialize the base64 string into NumPy arrays
        reconstructed_layers = GradientDeserializer.deserialize(
            quantised=payload.quantised,
            delta_indices=payload.delta_indices,
            delta_values_b64=payload.delta_values
        )
        
        # 2. Enqueue into Redis for the Flower Server
        adapter = FlowerBrowserClientAdapter(redis_client)
        adapter.enqueue_gradient(
            session_id=payload.session_id,
            student_id=payload.student_id,
            model_version=payload.model_version,
            gear=payload.gear_at_submission,
            sample_count=payload.sample_count,
            dp_sigma=payload.dp_sigma,
            reconstructed_layers=reconstructed_layers
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to process gradient payload: {str(e)}"
        )

    return {"status": "accepted", "session_id": payload.session_id}


@router.get("/model/version")
async def get_model_version():
    """
    Get the current global model version integer.
    """
    # TODO: Query ModelVersionStore
    return {"version": 0}


@router.get("/model/download")
async def download_model():
    """
    Download the current global model in TensorFlow.js format.
    """
    # TODO: Serve from ModelVersionStore
    return {"message": "Not implemented"}
