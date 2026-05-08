from fastapi.testclient import TestClient
from sqlalchemy import delete
from unittest.mock import patch

from bezp_server.db.models import AnomalyEvent
from bezp_server.main import create_app


def test_health_endpoint() -> None:
    with TestClient(create_app()) as client:
        response = client.get("/api/v1/health")

        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


def test_startup_runs_alembic_upgrade() -> None:
    with patch("bezp_server.db.session.command.upgrade") as upgrade, patch(
        "bezp_server.db.session.command.stamp"
    ) as stamp:
        with TestClient(create_app()) as client:
            response = client.get("/api/v1/health")

        assert response.status_code == 200
        assert upgrade.called or stamp.called


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
        clear_session_cache(app, "session-001")
        created = client.post("/api/v1/anomaly-scores", json=payload)
        summary = client.get("/api/v1/anomaly-scores/session-001")

        assert created.status_code == 201
        assert created.json()["event_id"]
        assert summary.status_code == 200
        assert summary.json()["event_count"] == 1
        assert summary.json()["latest_score"]["weighted_score"] == 0.72


def test_anomaly_summary_cache_invalidation_after_new_event() -> None:
    app = create_app()
    first = {
        "session_id": "session-cache-001",
        "student_id": "student-001",
        "channel_scores": {"pose_gaze": 0.61, "rppg": 0.0, "au": 0.0, "keystroke": 0.0},
        "agreement_index": 0.0,
        "weighted_score": 0.61,
        "tier": "tier_2",
        "gear": "gear_1",
        "metadata": {"source": "test"},
    }
    second = {
        **first,
        "weighted_score": 0.83,
        "channel_scores": {"pose_gaze": 0.83, "rppg": 0.0, "au": 0.0, "keystroke": 0.0},
    }

    with TestClient(app) as client:
        clear_anomaly_events(app)
        clear_session_cache(app, "session-cache-001")
        client.post("/api/v1/anomaly-scores", json=first)
        prime = client.get("/api/v1/anomaly-scores/session-cache-001")
        client.post("/api/v1/anomaly-scores", json=second)
        updated = client.get("/api/v1/anomaly-scores/session-cache-001")

        assert prime.status_code == 200
        assert prime.json()["event_count"] == 1
        assert updated.status_code == 200
        assert updated.json()["event_count"] == 2
        assert updated.json()["latest_score"]["weighted_score"] == 0.83


def test_session_state_updates_on_ingest() -> None:
    app = create_app()
    payload = {
        "session_id": "session-state-001",
        "student_id": "student-state-001",
        "channel_scores": {"pose_gaze": 0.44, "rppg": 0.0, "au": 0.0, "keystroke": 0.0},
        "agreement_index": 0.0,
        "weighted_score": 0.44,
        "tier": "tier_3",
        "gear": "gear_1",
        "metadata": {"source": "test"},
    }
    with TestClient(app) as client:
        clear_anomaly_events(app)
        clear_session_cache(app, "session-state-001")
        clear_session_state(app, "session-state-001")
        clear_rate_key(app, "session-state:read", "session-state-001")
        created = client.post("/api/v1/anomaly-scores", json=payload)
        state = client.get("/api/v1/sessions/session-state-001/state")

        assert created.status_code == 201
        assert state.status_code == 200
        assert state.json()["session_id"] == "session-state-001"
        assert state.json()["student_id"] == "student-state-001"
        assert state.json()["event_count"] == 1
        assert state.json()["last_tier"] == "tier_3"
        assert state.json()["status"] == "active"
        assert state.json()["current_gear"] == "gear_1"


def test_session_heartbeat_creates_live_state() -> None:
    app = create_app()

    with TestClient(app) as client:
        clear_session_state(app, "session-heartbeat-001")
        clear_rate_key(app, "session:heartbeat", "session-heartbeat-001")
        response = client.post(
            "/api/v1/sessions/session-heartbeat-001/heartbeat",
            json={"student_id": "student-heartbeat-001", "status": "active", "gear": "gear_2"},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["session_id"] == "session-heartbeat-001"
        assert body["student_id"] == "student-heartbeat-001"
        assert body["event_count"] == 0
        assert body["heartbeat_count"] == 1
        assert body["status"] == "active"
        assert body["current_gear"] == "gear_2"
        assert body["last_heartbeat_at"]


def test_session_heartbeat_preserves_latest_anomaly_fields() -> None:
    app = create_app()
    payload = {
        "session_id": "session-heartbeat-merge-001",
        "student_id": "student-heartbeat-merge-001",
        "channel_scores": {"pose_gaze": 0.66, "rppg": 0.0, "au": 0.0, "keystroke": 0.0},
        "agreement_index": 0.0,
        "weighted_score": 0.66,
        "tier": "tier_2",
        "gear": "gear_1",
        "metadata": {"source": "test"},
    }

    with TestClient(app) as client:
        clear_anomaly_events(app)
        clear_session_state(app, "session-heartbeat-merge-001")
        clear_rate_key(app, "ingest", "student-heartbeat-merge-001")
        clear_rate_key(app, "session:heartbeat", "session-heartbeat-merge-001")

        created = client.post("/api/v1/anomaly-scores", json=payload)
        heartbeat = client.post(
            "/api/v1/sessions/session-heartbeat-merge-001/heartbeat",
            json={"student_id": "student-heartbeat-merge-001", "status": "active", "gear": "gear_2"},
        )

        assert created.status_code == 201
        assert heartbeat.status_code == 200
        body = heartbeat.json()
        assert body["event_count"] == 1
        assert body["last_tier"] == "tier_2"
        assert body["last_weighted_score"] == 0.66
        assert body["current_gear"] == "gear_2"
        assert body["last_gear"] == "gear_1"


def test_ingestion_rate_limit_enforced() -> None:
    app = create_app()

    payload = {
        "session_id": "session-rate-001",
        "student_id": "student-rate-001",
        "channel_scores": {"pose_gaze": 0.12, "rppg": 0.0, "au": 0.0, "keystroke": 0.0},
        "agreement_index": 0.0,
        "weighted_score": 0.12,
        "tier": "tier_3",
        "gear": "gear_1",
        "metadata": {"source": "test"},
    }

    with TestClient(app) as client:
        clear_rate_key(app, "ingest", "student-rate-001")
        set_rate_count(app, "ingest", "student-rate-001", 120)
        response = client.post("/api/v1/anomaly-scores", json=payload)
        assert response.status_code == 429


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


def test_signaling_enqueue_and_dequeue() -> None:
    app = create_app()
    signal = {
        "session_id": "session-signal-001",
        "sender_id": "student-001",
        "target_id": "proctor-001",
        "signal_type": "offer",
        "payload": '{"type":"offer","sdp":"fake-sdp"}',
    }

    with TestClient(app) as client:
        clear_session_cache(app, "session-signal-001")
        clear_rate_key(app, "signaling:enqueue", "student-001")
        clear_rate_key(app, "signaling:dequeue", "proctor-001")
        queued = client.post("/api/v1/signaling", json=signal)
        fetched = client.get("/api/v1/signaling/session-signal-001/proctor-001/offer")
        missing = client.get("/api/v1/signaling/session-signal-001/proctor-001/offer")

        assert queued.status_code == 202
        assert queued.json()["status"] == "queued"
        assert fetched.status_code == 200
        assert fetched.json()["payload"] == signal["payload"]
        assert missing.status_code == 404


def test_signaling_enqueue_rate_limit_enforced() -> None:
    app = create_app()
    signal = {
        "session_id": "session-signal-rate-001",
        "sender_id": "student-rate-signal-001",
        "target_id": "proctor-001",
        "signal_type": "offer",
        "payload": '{"type":"offer","sdp":"fake-sdp"}',
    }

    with TestClient(app) as client:
        clear_rate_key(app, "signaling:enqueue", "student-rate-signal-001")
        set_rate_count(app, "signaling:enqueue", "student-rate-signal-001", 180)
        response = client.post("/api/v1/signaling", json=signal)

        assert response.status_code == 429


def test_signaling_dequeue_rate_limit_enforced() -> None:
    app = create_app()

    with TestClient(app) as client:
        clear_rate_key(app, "signaling:dequeue", "proctor-rate-001")
        set_rate_count(app, "signaling:dequeue", "proctor-rate-001", 600)
        response = client.get("/api/v1/signaling/session-rate-001/proctor-rate-001/offer")

        assert response.status_code == 429


def test_signaling_rejects_invalid_signal_type() -> None:
    app = create_app()
    signal = {
        "session_id": "session-signal-002",
        "sender_id": "student-001",
        "target_id": "proctor-001",
        "signal_type": "offer",
        "payload": '{"type":"offer","sdp":"fake-sdp"}',
    }

    with TestClient(app) as client:
        clear_rate_key(app, "signaling:enqueue", "student-001")
        client.post("/api/v1/signaling", json=signal)
        invalid = client.get("/api/v1/signaling/session-signal-002/proctor-001/not-a-type")

        assert invalid.status_code == 422


def test_session_state_read_rate_limit_enforced() -> None:
    app = create_app()

    with TestClient(app) as client:
        clear_rate_key(app, "session-state:read", "session-rate-read-001")
        set_rate_count(app, "session-state:read", "session-rate-read-001", 240)
        response = client.get("/api/v1/sessions/session-rate-read-001/state")

        assert response.status_code == 429


def test_session_heartbeat_rate_limit_enforced() -> None:
    app = create_app()

    with TestClient(app) as client:
        clear_rate_key(app, "session:heartbeat", "session-heartbeat-rate-001")
        set_rate_count(app, "session:heartbeat", "session-heartbeat-rate-001", 180)
        response = client.post(
            "/api/v1/sessions/session-heartbeat-rate-001/heartbeat",
            json={"student_id": "student-heartbeat-rate-001"},
        )

        assert response.status_code == 429


def clear_anomaly_events(app) -> None:
    with app.state.database.session_factory() as db:
        db.execute(delete(AnomalyEvent))
        db.commit()


def clear_session_cache(app, session_id: str) -> None:
    app.state.redis.delete(f"bezp:session-summary:{session_id}")


def clear_session_state(app, session_id: str) -> None:
    app.state.redis.delete(f"bezp:session-state:{session_id}")


def clear_rate_key(app, namespace: str, subject: str) -> None:
    app.state.redis.delete(f"bezp:rate:{namespace}:{subject}")


def set_rate_count(app, namespace: str, subject: str, count: int) -> None:
    app.state.redis.setex(f"bezp:rate:{namespace}:{subject}", 60, count)
