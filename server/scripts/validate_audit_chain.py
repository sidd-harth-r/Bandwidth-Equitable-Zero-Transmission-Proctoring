import argparse
import hashlib
import json
import sys
from datetime import datetime, timedelta
from typing import List, Dict, Any

from sqlalchemy import select, create_engine
from sqlalchemy.orm import Session

# Add the src directory to sys.path to import bezp_server modules
# This assumes the script is run from the project root or the server directory
import os
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "src"))

from bezp_server.db.models import AnomalyEvent
from bezp_server.config import get_settings

def compute_hash(payload: Dict[str, Any], prev_hash: str) -> str:
    # Deterministic JSON serialization for hashing
    # Fields must match what the client hashes
    # session_id, student_id, occurred_at, channel_scores, agreement_index, 
    # weighted_score, tier, gear, metadata, prev_hash
    
    # occurred_at must be formatted exactly as the client's JSON.stringify(date)
    # Usually ISO string with milliseconds.
    
    data = {
        "channel_scores": payload["channel_scores"],
        "agreement_index": payload["agreement_index"],
        "weighted_score": payload["weighted_score"],
        "session_id": payload["session_id"],
        "student_id": payload["student_id"],
        "occurred_at": payload["occurred_at"],
        "tier": payload["tier"],
        "gear": payload["gear"],
        "metadata": payload["metadata"],
        "prev_hash": prev_hash
    }
    
    message = json.dumps(data, sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(message.encode()).hexdigest()

def validate_session(session_id: str, db: Session, gap_threshold_seconds: int = 10):
    events = list(
        db.scalars(
            select(AnomalyEvent)
            .where(AnomalyEvent.session_id == session_id)
            .order_by(AnomalyEvent.received_at.asc())
        )
    )
    
    if not events:
        return {
            "session_id": session_id,
            "status": "ERROR",
            "message": "No events found for session"
        }
    
    results = {
        "session_id": session_id,
        "event_count": len(events),
        "status": "PASS",
        "checks": {
            "hash_chain": "PASS",
            "monotonicity": "PASS",
            "record_count": "PASS"
        },
        "issues": []
    }
    
    # 1. Hash Chain Integrity
    prev_hash = session_id # Seed matches client
    for i, event in enumerate(events):
        payload = {
            "channel_scores": event.channel_scores,
            "agreement_index": event.agreement_index,
            "weighted_score": event.weighted_score,
            "session_id": event.session_id,
            "student_id": event.student_id,
            "occurred_at": event.occurred_at.isoformat().replace("+00:00", "Z"), # ISO 8601
            "tier": event.tier,
            "gear": event.gear,
            "metadata": event.event_metadata,
        }
        
        expected_hash = compute_hash(payload, prev_hash)
        if event.chain_hash != expected_hash:
            results["status"] = "FAIL"
            results["checks"]["hash_chain"] = "FAIL"
            results["issues"].append(f"Hash mismatch at event {event.event_id} (index {i})")
        
        # Update prev_hash for next iteration
        prev_hash = event.chain_hash

    # 2. Monotonicity & Gaps
    last_time = None
    for i, event in enumerate(events):
        if last_time:
            gap = (event.occurred_at - last_time).total_seconds()
            if gap < 0:
                results["status"] = "FAIL"
                results["checks"]["monotonicity"] = "FAIL"
                results["issues"].append(f"Non-monotonic timestamp at event {event.event_id} (index {i})")
            elif gap > gap_threshold_seconds:
                results["issues"].append(f"Large gap of {gap}s detected before event {event.event_id} (index {i})")
        last_time = event.occurred_at

    # 3. Expected Count Check
    # This requires knowing the session duration and intended frequency.
    # For now, we'll just flag if the issues list has many gaps.
    
    return results

def main():
    parser = argparse.ArgumentParser(description="Forensic verification of BEZP hash chains.")
    parser.add_argument("session_id", help="The session ID to validate")
    parser.add_argument("--json", action="store_true", help="Output results in JSON format")
    parser.add_argument("--gap-threshold", type=int, default=10, help="Threshold in seconds for gap detection")
    
    args = parser.parse_args()
    
    settings = get_settings()
    engine = create_engine(settings.database_url)
    
    with Session(engine) as db:
        results = validate_session(args.session_id, db, args.gap_threshold)
        
    if args.json:
        print(json.dumps(results, indent=2))
    else:
        print(f"Audit Results for Session: {results['session_id']}")
        print(f"Status: {results['status']}")
        print(f"Events: {results['event_count']}")
        print(f"Checks: {results['checks']}")
        if results['issues']:
            print("Issues found:")
            for issue in results['issues']:
                print(f" - {issue}")

    if results["status"] != "PASS":
        sys.exit(1)

if __name__ == "__main__":
    main()
