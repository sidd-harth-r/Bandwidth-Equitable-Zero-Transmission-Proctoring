import pytest
import base64
import numpy as np
import json
import pickle
from fastapi.testclient import TestClient

from bezp_server.main import create_app
from bezp_server.ml.GradientDeserializer import TOTAL_WEIGHTS, MODEL_SHAPES
from bezp_server.api.routes.federated import GradientPayload

def test_federated_bridge_end_to_end_deserialization():
    """
    Test the full path: HTTP POST -> Deserialization -> Redis Enqueue.
    """
    with TestClient(create_app()) as client:
        redis_client = client.app.state.redis
        
        # 1. Generate a mock sparsified gradient
        # Let's say only 5 weights changed out of the total.
        indices = [0, 100, 500, 1000, 50000]
        values = np.array([0.1, -0.2, 0.3, -0.4, 0.5], dtype=np.float32)
        
        # 2. Encode to base64
        raw_bytes = values.tobytes()
        b64_values = base64.b64encode(raw_bytes).decode("ascii")
        
        # 3. Construct the payload
        payload = {
            "session_id": "test_session_fl",
            "student_id": "test_student",
            "model_version": 1,
            "gear_at_submission": 2,
            "quantised": False,
            "delta_indices": indices,
            "delta_values": b64_values,
            "dp_sigma": 0.01,
            "sample_count": 150,
            "timestamp": 1234567890
        }
        
        # 4. Clear redis queue before test
        redis_client.delete("bezp:fl:gradients")
        
        # 5. Send HTTP POST
        response = client.post("/api/v1/federated/gradients", json=payload)
        
        # 6. Verify HTTP response
        assert response.status_code == 202
        assert response.json()["status"] == "accepted"
        
        # 7. Verify Redis enqueue
        queue_len = redis_client.llen("bezp:fl:gradients")
        assert queue_len == 1
        
        # 8. Dequeue and verify contents (Simulating Flower server reading)
        raw_queue_data = redis_client.lpop("bezp:fl:gradients")
        enqueued_data = pickle.loads(base64.b64decode(raw_queue_data))
        
        assert enqueued_data["session_id"] == "test_session_fl"
        assert enqueued_data["gear"] == 2
        
        layers = enqueued_data["layers"]
        assert len(layers) == len(MODEL_SHAPES)
        
        # Check that the deserializer placed the values in the right places
        # We'll re-flatten the layers and check the indices
        reconstructed_flat = np.concatenate([layer.flatten() for layer in layers])
        
        assert reconstructed_flat.shape[0] == TOTAL_WEIGHTS
        
        for i, idx in enumerate(indices):
            assert np.isclose(reconstructed_flat[idx], values[i])
            
        # Check that non-updated weights are zero
        non_updated = np.delete(reconstructed_flat, indices)
        assert np.all(non_updated == 0.0)

def test_federated_bridge_quantised_deserialization():
    """
    Test the path with 8-bit quantized values.
    """
    with TestClient(create_app()) as client:
        redis_client = client.app.state.redis
        indices = [10, 20, 30]
        
        # Mock quantised data: scale = 0.01, values = [1, -2, 3] -> actual = [0.01, -0.02, 0.03]
        scale = np.array([0.01], dtype=np.float32)
        int8_vals = np.array([1, -2, 3], dtype=np.int8)
        
        raw_bytes = scale.tobytes() + int8_vals.tobytes()
        b64_values = base64.b64encode(raw_bytes).decode("ascii")
        
        payload = {
            "session_id": "test_session_fl_quant",
            "student_id": "test_student",
            "model_version": 1,
            "gear_at_submission": 3,
            "quantised": True,
            "delta_indices": indices,
            "delta_values": b64_values,
            "dp_sigma": 0.02,
            "sample_count": 150,
            "timestamp": 1234567890
        }
        
        redis_client.delete("bezp:fl:gradients")
        response = client.post("/api/v1/federated/gradients", json=payload)
        assert response.status_code == 202
        
        raw_queue_data = redis_client.lpop("bezp:fl:gradients")
        enqueued_data = pickle.loads(base64.b64decode(raw_queue_data))
        
        reconstructed_flat = np.concatenate([layer.flatten() for layer in enqueued_data["layers"]])
        
        expected_values = [0.01, -0.02, 0.03]
        for i, idx in enumerate(indices):
            assert np.isclose(reconstructed_flat[idx], expected_values[i], atol=1e-6)

