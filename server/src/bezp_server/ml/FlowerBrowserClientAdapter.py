"""
Bridge between FastAPI endpoints and the Flower aggregation server.
Uses Redis as a queue to pass gradients asynchronously.
"""

import base64
import json
import pickle
from redis import Redis
import numpy as np


class FlowerBrowserClientAdapter:
    """
    Adapter that receives REST/JSON payloads from the browser,
    deserializes them, and queues them in Redis for the Flower
    server to aggregate.
    """
    def __init__(self, redis_client: Redis):
        self.redis = redis_client
        self.queue_key = "bezp:fl:gradients"

    def enqueue_gradient(
        self,
        session_id: str,
        student_id: str,
        model_version: int,
        gear: int,
        sample_count: int,
        dp_sigma: float,
        reconstructed_layers: list[np.ndarray]
    ):
        """
        Package the reconstructed layers and metadata and push to Redis.
        """
        # Pickle the numpy arrays and metadata for the Flower process
        payload = {
            "session_id": session_id,
            "student_id": student_id,
            "model_version": model_version,
            "gear": gear,
            "sample_count": sample_count,
            "dp_sigma": dp_sigma,
            "layers": reconstructed_layers
        }
        
        # We must serialize the binary payload (e.g., pickle) because 
        # numpy arrays aren't natively JSON serializable.
        binary_data = pickle.dumps(payload)
        
        # Since the app's Redis client is configured with decode_responses=True,
        # we must base64 encode the binary data to store it as a string.
        b64_data = base64.b64encode(binary_data).decode("ascii")
        
        self.redis.rpush(self.queue_key, b64_data)
        
        # Optional: Keep queue size bounded
        self.redis.ltrim(self.queue_key, 0, 999)
