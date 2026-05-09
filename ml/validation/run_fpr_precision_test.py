import json
import math
import os
import h5py
import numpy as np

# Replicated constants from client/src/coordinator/types.ts
DEFAULT_CHANNEL_WEIGHTS = {
    "pose_gaze": 0.35,
    "rppg": 0.20,
    "au": 0.25,
    "keystroke": 0.20,
}

DEFAULT_TIER_THRESHOLDS = {
    "tier1ScoreThreshold": 0.85,
    "tier1AgreementCeiling": 0.15,
    "tier2ScoreThreshold": 0.6,
    "tier2DisagreementFloor": 0.25,
    "tier2DisagreementScoreThreshold": 0.5,
}

def clamp01(value):
    if not math.isfinite(value):
        return 0.0
    return min(1.0, max(0.0, value))

class FusionEngine:
    def __init__(self, weights=None):
        self.weights = DEFAULT_CHANNEL_WEIGHTS.copy()
        if weights:
            self.weights.update(weights)
        self.active_channels = {k: True for k in self.weights.keys()}

    def fuse(self, channel_scores):
        active_keys = [k for k in self.weights.keys() if self.active_channels.get(k, True)]
        num_active = len(active_keys) or 1
        
        scores = [clamp01(channel_scores.get(k, 0.0)) for k in active_keys]
        mean = sum(scores) / num_active
        
        variance = sum([(s - mean) ** 2 for s in scores]) / num_active
        agreement_index = min(0.5, math.sqrt(variance))
        
        total_weight = sum([self.weights[k] for k in active_keys]) or 1.0
        weighted_score = sum([clamp01(channel_scores.get(k, 0.0)) * self.weights[k] for k in active_keys]) / total_weight
        
        return {
            "agreement_index": round(agreement_index, 4),
            "weighted_score": round(weighted_score, 4)
        }

class TierClassifier:
    def __init__(self, thresholds=None):
        self.thresholds = DEFAULT_TIER_THRESHOLDS.copy()
        if thresholds:
            self.thresholds.update(thresholds)

    def classify(self, fusion):
        weighted_score = fusion["weighted_score"]
        agreement_index = fusion["agreement_index"]
        t = self.thresholds
        
        if weighted_score > t["tier1ScoreThreshold"] and agreement_index < t["tier1AgreementCeiling"]:
            return "tier_1"
        
        if weighted_score > t["tier2ScoreThreshold"] or (
            weighted_score > t["tier2DisagreementScoreThreshold"] and 
            agreement_index > t["tier2DisagreementFloor"]
        ):
            return "tier_2"
            
        return "tier_3"

def generate_mock_data(filename):
    """Generate mock validation data if h5 file is missing."""
    with h5py.File(filename, "w") as f:
        # Legitimate sequences (50 sequences, 600 timesteps)
        legit = f.create_group("legitimate")
        for i in range(50):
            # Normal distribution around 0.1-0.2
            data = np.random.normal(0.15, 0.05, (600, 4))
            legit.create_dataset(f"seq_{i}", data=np.clip(data, 0, 1))
            
        # Cheating sequences (80 sequences, 600 timesteps)
        cheating = f.create_group("cheating")
        for i in range(80):
            # Normal distribution around 0.1, but with a "cheating" burst
            data = np.random.normal(0.1, 0.05, (600, 4))
            # Burst of high scores in some channels
            start = np.random.randint(100, 400)
            length = np.random.randint(50, 150)
            # High scores in pose_gaze and au (index 0 and 2)
            data[start:start+length, 0] = np.random.normal(0.9, 0.05, length)
            data[start:start+length, 2] = np.random.normal(0.8, 0.1, length)
            cheating.create_dataset(f"seq_{i}", data=np.clip(data, 0, 1))

def run_validation(filename):
    fusion_engine = FusionEngine()
    classifier = TierClassifier()
    
    results = {
        "legitimate": {"total_timesteps": 0, "alerts": 0},
        "cheating": {"total_timesteps": 0, "alerts": 0, "detected_sequences": 0}
    }
    
    with h5py.File(filename, "r") as f:
        print(f"H5 Keys: {list(f.keys())}")
        # Evaluate Legitimate
        if "legitimate" in f:
            for name in f["legitimate"]:
                seq = f["legitimate"][name][()]
                results["legitimate"]["total_timesteps"] += len(seq)
                for timestep in seq:
                    scores = {"pose_gaze": timestep[0], "rppg": timestep[1], "au": timestep[2], "keystroke": timestep[3]}
                    fusion = fusion_engine.fuse(scores)
                    tier = classifier.classify(fusion)
                    if tier != "tier_3":
                        results["legitimate"]["alerts"] += 1
                        
        # Evaluate Cheating
        if "cheating" in f:
            for name in f["cheating"]:
                seq = f["cheating"][name][()]
                results["cheating"]["total_timesteps"] += len(seq)
                sequence_detected = False
                for timestep in seq:
                    scores = {"pose_gaze": timestep[0], "rppg": timestep[1], "au": timestep[2], "keystroke": timestep[3]}
                    fusion = fusion_engine.fuse(scores)
                    tier = classifier.classify(fusion)
                    if tier != "tier_3":
                        results["cheating"]["alerts"] += 1
                        sequence_detected = True
                if sequence_detected:
                    results["cheating"]["detected_sequences"] += 1
                
        # Calculate Metrics
        fpr = results["legitimate"]["alerts"] / results["legitimate"]["total_timesteps"] if results["legitimate"]["total_timesteps"] > 0 else 0
        precision = results["cheating"]["alerts"] / (results["cheating"]["alerts"] + results["legitimate"]["alerts"]) if (results["cheating"]["alerts"] + results["legitimate"]["alerts"]) > 0 else 0
        cheating_seq_count = len(list(f["cheating"].keys())) if "cheating" in f else 0
        recall = results["cheating"]["detected_sequences"] / cheating_seq_count if cheating_seq_count > 0 else 0
    
    return {
        "fpr": round(fpr, 4),
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "legitimate_alerts": results["legitimate"]["alerts"],
        "cheating_alerts": results["cheating"]["alerts"],
        "total_legitimate_timesteps": results["legitimate"]["total_timesteps"]
    }

if __name__ == "__main__":
    h5_path = "validation_set.h5"
    if not os.path.exists(h5_path):
        print(f"Generating mock validation set at {h5_path}...")
        generate_mock_data(h5_path)
        
    metrics = run_validation(h5_path)
    print(json.dumps(metrics, indent=2))
    
    # Save to report
    os.makedirs("docs/validation", exist_ok=True)
    with open("docs/validation/fpr_precision_report.json", "w") as f:
        json.dump(metrics, f, indent=2)
