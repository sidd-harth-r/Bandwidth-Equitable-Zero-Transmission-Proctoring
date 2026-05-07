from fastapi.testclient import TestClient
from sqlalchemy import delete

from bezp_server.db.models import AnomalyEvent
from bezp_server.main import create_app


def test_health_endpoint() -> None:
    with TestClient(create_app()) as client:
        response = client.get("/api/v1/health")

        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


def test_anomaly_score_ingestion_and_summary() -> None:
    app = create_app()
    payload = {
        "session_id": "session-001",
        "student_id": "student-001",
        "channel_scores": {
            "pose_gaze": 0.72,
            "rppg": 0.0,
            "au": 0.0,
            "keystroke": 0.0,
        },
        "agreement_index": 0.0,
        "weighted_score": 0.72,
        "tier": "tier_2",
        "gear": "gear_1",
        "metadata": {"source": "test"},
    }

    with TestClient(app) as client:
        clear_anomaly_events(app)
        created = client.post("/api/v1/anomaly-scores", json=payload)
        summary = client.get("/api/v1/anomaly-scores/session-001")

        assert created.status_code == 201
        assert created.json()["event_id"]
        assert summary.status_code == 200
        assert summary.json()["event_count"] == 1
        assert summary.json()["latest_score"]["weighted_score"] == 0.72


def test_anomaly_score_rejects_raw_frame_metadata() -> None:
    with TestClient(create_app()) as client:
        payload = {
            "session_id": "session-001",
            "student_id": "student-001",
            "channel_scores": {"pose_gaze": 1.7},
            "agreement_index": 0.0,
            "weighted_score": 0.72,
            "tier": "tier_2",
            "gear": "gear_1",
        }

        response = client.post("/api/v1/anomaly-scores", json=payload)

        assert response.status_code == 422


def clear_anomaly_events(app) -> None:
    with app.state.database.session_factory() as db:
        db.execute(delete(AnomalyEvent))
        db.commit()
