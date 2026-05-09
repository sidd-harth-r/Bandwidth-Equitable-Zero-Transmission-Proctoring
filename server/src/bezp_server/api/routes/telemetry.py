from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from ...database.postgres_client import get_db

router = APIRouter()

class TelemetryEntry(BaseModel):
    rttMs: float
    plr: float
    jitterMs: float
    timestamp: str
    gear: str

class TelemetryBatch(BaseModel):
    session_id: str
    student_id: str
    entries: List[TelemetryEntry]

@router.post("")
async def receive_telemetry(batch: TelemetryBatch, db=Depends(get_db)):
    """
    Receives a batch of network telemetry entries and stores them in TimescaleDB.
    """
    try:
        # In a real implementation, we would insert these into a TimescaleDB hypertable
        # e.g., INSERT INTO network_telemetry (session_id, student_id, time, rtt_ms, plr, jitter_ms, gear)
        # VALUES ...
        # For now, we mock the successful ingestion.
        
        # Log the batch size for debugging
        print(f"Received {len(batch.entries)} telemetry entries for session {batch.session_id}")
        
        return {"status": "accepted", "count": len(batch.entries)}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
