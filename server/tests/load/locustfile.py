import random
import time
import uuid
from locust import HttpUser, task, between, events

class BezpProctorUser(HttpUser):
    wait_time = between(0.05, 0.15) # Simulate 10Hz updates (approx)
    
    def on_start(self):
        self.student_id = f"student_{uuid.uuid4().hex[:8]}"
        self.session_id = f"session_{uuid.uuid4().hex[:8]}"
        self.start_time = time.time()
        self.updates_sent = 0

    @task(10) # 10x more likely than other tasks
    def post_anomaly_score(self):
        if time.time() - self.start_time > 900: # 15 minute session limit
            self.stop()
            return

        payload = {
            "session_id": self.session_id,
            "student_id": self.student_id,
            "occurred_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "channel_scores": {
                "pose_gaze": random.uniform(0.1, 0.2),
                "rppg": random.uniform(0.1, 0.2),
                "au": random.uniform(0.1, 0.2),
                "keystroke": random.uniform(0.1, 0.2)
            },
            "agreement_index": random.uniform(0.0, 0.1),
            "weighted_score": random.uniform(0.1, 0.2),
            "tier": "tier_3",
            "gear": "gear_1",
            "chain_hash": "0" * 64, # Mock hash for load testing
            "metadata": {"source": "load_test"}
        }
        
        with self.client.post("/api/v1/anomaly-scores", json=payload, catch_response=True) as response:
            if response.status_code == 201:
                response.success()
            else:
                response.failure(f"Failed with status {response.status_code}")
        
        self.updates_sent += 1

    @task(1)
    def upload_gradients(self):
        # Only upload once after at least 100 updates
        if self.updates_sent < 100:
            return
            
        payload = {
            "session_id": self.session_id,
            "student_id": self.student_id,
            "model_version": 1,
            "gear_at_submission": 1,
            "quantised": False,
            "delta_indices": [0, 1, 2],
            "delta_values": "AAAA", # Mock b64
            "dp_sigma": 0.01,
            "sample_count": 1000,
            "timestamp": int(time.time() * 1000)
        }
        
        self.client.post("/api/v1/federated/gradients", json=payload)
        self.interrupt() # Stop this user after gradient upload

@events.init_command_line_parser.add_listener
def _(parser):
    parser.add_argument("--session-duration", type=int, default=900, help="Duration of simulated session in seconds")
