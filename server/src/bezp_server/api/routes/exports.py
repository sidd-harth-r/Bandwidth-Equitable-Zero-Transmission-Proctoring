import csv
import io
import hashlib
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from bezp_server.api.dependencies import get_db
from bezp_server.db.models import AnomalyEvent, GlobalModelVersion
from bezp_server.schemas.anomaly import AnomalyScoreOut

router = APIRouter(prefix="/exports", tags=["exports"])

def hash_id(id_str: str) -> str:
    return hashlib.sha256(id_str.encode()).hexdigest()

@router.get("/session/{session_id}/timeline.csv")
def export_session_timeline(
    session_id: str,
    db: Session = Depends(get_db)
):
    """Export the complete anomaly timeline for a session as CSV."""
    events = list(
        db.scalars(
            select(AnomalyEvent)
            .where(AnomalyEvent.session_id == session_id)
            .order_by(AnomalyEvent.occurred_at.asc())
        )
    )
    
    if not events:
        raise HTTPException(status_code=404, detail="No data found for session")
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Header
    writer.writerow([
        "session_id", "student_id_hashed", "timestamp_utc", "gear",
        "gaze_score", "rppg_score", "au_score", "keystroke_score",
        "fused_score", "agreement_index", "tier_classification", "alert_type"
    ])
    
    for event in events:
        cs = event.channel_scores
        writer.writerow([
            event.session_id,
            hash_id(event.student_id),
            event.occurred_at.isoformat(),
            event.gear,
            cs.get("pose_gaze", 0.0),
            cs.get("rppg", 0.0),
            cs.get("au", 0.0),
            cs.get("keystroke", 0.0),
            event.weighted_score,
            event.agreement_index,
            event.tier,
            "tier1" if event.tier == "tier_1" else ("tier2" if event.tier == "tier_2" else "none")
        ])
    
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=session_{session_id}_timeline.csv"}
    )

@router.get("/cohort/{exam_id}/summary.csv")
def export_cohort_summary(
    exam_id: str, # Assuming session_id contains exam_id or similar
    db: Session = Depends(get_db)
):
    """Export summary report for all students in a cohort/exam."""
    # This is a simplified implementation grouping by student_id
    # In a real app, there would be an explicit Exam table.
    
    # Query to get aggregate metrics per session
    # For now, we'll just mock this query result structure
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    writer.writerow([
        "session_id", "student_id_hashed", "exam_id", "session_start",
        "tier1_alert_count", "tier2_alert_count", "final_trust_score"
    ])
    
    # Example mock data for the export
    writer.writerow([
        "sess_001", hash_id("stud_A"), exam_id, "2024-05-09T10:00:00Z", 0, 2, 0.95
    ])
    writer.writerow([
        "sess_002", hash_id("stud_B"), exam_id, "2024-05-09T10:05:00Z", 1, 5, 0.72
    ])
    
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=cohort_{exam_id}_summary.csv"}
    )
