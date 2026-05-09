"""
Tests for FedAvgTieredStrategy — aggregation, staleness, and validation gate.
"""

import base64
import pickle

import numpy as np
from fastapi.testclient import TestClient

from bezp_server.main import create_app
from bezp_server.ml.strategy import FedAvgTieredStrategy
from bezp_server.ml.GradientDeserializer import MODEL_SHAPES
from bezp_server.ml.validation import (
    ValidationBaseline,
    generate_synthetic_validation_set,
    validation_gate,
)


def _make_gradient(session_id: str, model_version: int, sample_count: int = 100) -> dict:
    """Create a mock gradient payload."""
    layers = [np.random.randn(*shape).astype(np.float32) * 0.01 for shape in MODEL_SHAPES]
    return {
        "session_id": session_id,
        "student_id": f"student_{session_id}",
        "model_version": model_version,
        "gear": 1,
        "sample_count": sample_count,
        "dp_sigma": 0.01,
        "layers": layers,
    }


def _enqueue(redis_client, gradient: dict) -> None:
    """Enqueue a gradient into Redis the same way FlowerBrowserClientAdapter does."""
    binary = pickle.dumps(gradient)
    b64 = base64.b64encode(binary).decode("ascii")
    redis_client.rpush("bezp:fl:gradients", b64)


# ── Aggregation Tests ─────────────────────────────────────


def test_aggregation_with_5_clients():
    """Run aggregation with 5 simulated clients all at the same model version."""
    with TestClient(create_app()) as client:
        redis_client = client.app.state.redis
        redis_client.delete("bezp:fl:gradients")

        strategy = FedAvgTieredStrategy(
            redis_client=redis_client,
            current_model_version=1,
            min_clients_per_round=3,
        )

        # Enqueue 5 gradients
        for i in range(5):
            _enqueue(redis_client, _make_gradient(f"session_{i}", model_version=1))

        result = strategy.run_round()

        assert result is not None
        assert len(result) == len(MODEL_SHAPES)
        for layer, shape in zip(result, MODEL_SHAPES):
            assert layer.shape == shape


def test_aggregation_below_minimum_clients_defers():
    """If fewer than min_clients submit, all are re-queued."""
    with TestClient(create_app()) as client:
        redis_client = client.app.state.redis
        redis_client.delete("bezp:fl:gradients")

        strategy = FedAvgTieredStrategy(
            redis_client=redis_client,
            current_model_version=1,
            min_clients_per_round=5,
        )

        # Only 2 gradients
        for i in range(2):
            _enqueue(redis_client, _make_gradient(f"session_{i}", model_version=1))

        result = strategy.run_round()

        assert result is None
        # Gradients should be re-queued
        queue_len = redis_client.llen("bezp:fl:gradients")
        assert queue_len == 2


def test_stale_gradient_deferred_to_next_round():
    """
    Submit a gradient with model_version = current - 2.
    Verify it is classified as Tier 3 and deferred.
    """
    with TestClient(create_app()) as client:
        redis_client = client.app.state.redis
        redis_client.delete("bezp:fl:gradients")

        strategy = FedAvgTieredStrategy(
            redis_client=redis_client,
            current_model_version=3,
            min_clients_per_round=3,
            max_staleness_for_inclusion=1,
        )

        # 3 current gradients
        for i in range(3):
            _enqueue(redis_client, _make_gradient(f"current_{i}", model_version=3))

        # 1 stale gradient (version 1, staleness = 2)
        stale_grad = _make_gradient("stale_client", model_version=1, sample_count=50)
        _enqueue(redis_client, stale_grad)

        # Verify staleness classification
        assert strategy.classify_staleness(3) == 0  # current
        assert strategy.classify_staleness(2) == 1  # one behind
        assert strategy.classify_staleness(1) == 2  # deferred

        result = strategy.run_round()

        # Aggregation should succeed with the 3 current gradients
        assert result is not None

        # The stale gradient should be re-queued
        queue_len = redis_client.llen("bezp:fl:gradients")
        assert queue_len == 1

        # Verify re-queued gradient is the stale one
        raw = redis_client.lpop("bezp:fl:gradients")
        deferred = pickle.loads(base64.b64decode(raw))
        assert deferred["session_id"] == "stale_client"


def test_staleness_weight_reduces_contribution():
    """Verify that one-version-behind gradients get 0.5× weight."""
    with TestClient(create_app()) as client:
        redis_client = client.app.state.redis

        strategy = FedAvgTieredStrategy(
            redis_client=redis_client,
            current_model_version=2,
        )

        current_grad = _make_gradient("current", model_version=2, sample_count=100)
        stale_grad = _make_gradient("stale", model_version=1, sample_count=100)

        w_current = strategy.compute_weight(current_grad)
        w_stale = strategy.compute_weight(stale_grad)

        assert w_current == 100.0  # full weight
        assert w_stale == 50.0  # half weight


# ── Validation Gate Tests ─────────────────────────────────


def test_synthetic_validation_set_shape():
    """Verify the synthetic validation set has the correct shape."""
    X, y = generate_synthetic_validation_set()
    assert X.shape == (130, 150, 20)
    assert y.shape == (130, 1)

    # Check label balance: 50 legitimate, 80 anomaly
    assert np.sum(y == 0) == 50
    assert np.sum(y == 1) == 80


def test_validation_gate_accepts_good_model():
    """A model that doesn't degrade should be accepted."""
    weights = [np.random.randn(*shape).astype(np.float32) * 0.01 for shape in MODEL_SHAPES]
    baseline = ValidationBaseline(precision=0.0, recall=0.0)

    result = validation_gate(weights, baseline)
    assert result.accepted is True


def test_validation_gate_rejects_degraded_precision():
    """A model with precision drop > 2% should be rejected."""
    weights = [np.random.randn(*shape).astype(np.float32) * 0.01 for shape in MODEL_SHAPES]
    # Set a very high baseline that any model will fail
    baseline = ValidationBaseline(precision=0.99, recall=0.0)

    result = validation_gate(weights, baseline, max_degradation=0.02)
    # With a 0.99 baseline, any realistic model will drop
    assert result.accepted is False or result.precision >= 0.97
