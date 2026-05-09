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


# ── Routes ──────────────────────────────────────────────────

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
