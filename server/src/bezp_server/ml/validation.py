"""
Synthetic Validation Gate.

Evaluates an aggregated model against a synthetic validation set.
Rejects the round if precision OR recall drops more than 2% relative
to the previous accepted model.

The synthetic set covers:
- 50 legitimate exam sequences
- 30 coached-answer sequences
- 20 copy-paste sequences
- 20 phone-glance sequences
- 10 second-speaker sequences
Total: 130 labeled sequences
"""

import numpy as np
from dataclasses import dataclass


@dataclass
class ValidationResult:
    """Result of validation gate evaluation."""
    precision: float
    recall: float
    accuracy: float
    accepted: bool
    reason: str


@dataclass
class ValidationBaseline:
    """Previous model's validation metrics (baseline for comparison)."""
    precision: float
    recall: float

    @staticmethod
    def initial() -> "ValidationBaseline":
        """Cold-start baseline: random model performance."""
        return ValidationBaseline(precision=0.5, recall=0.5)


def generate_synthetic_validation_set(
    num_legitimate: int = 50,
    num_coached: int = 30,
    num_copypaste: int = 20,
    num_phone_glance: int = 20,
    num_second_speaker: int = 10,
    seq_length: int = 150,
    feature_dim: int = 20,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Generate a balanced synthetic validation set.
    
    Returns:
        X: shape (total, seq_length, feature_dim)
        y: shape (total, 1) — 0 for legitimate, 1 for anomaly
    """
    rng = np.random.RandomState(42)  # deterministic for reproducibility
    
    total = num_legitimate + num_coached + num_copypaste + num_phone_glance + num_second_speaker
    X = np.zeros((total, seq_length, feature_dim), dtype=np.float32)
    y = np.zeros((total, 1), dtype=np.float32)
    
    idx = 0
    
    # Legitimate: low variance, centered gaze, normal typing
    for _ in range(num_legitimate):
        X[idx] = rng.normal(0, 0.1, (seq_length, feature_dim))
        y[idx] = 0
        idx += 1
    
    # Coached-answer: burst typing patterns (keystroke features at indices 14-17)
    for _ in range(num_coached):
        X[idx] = rng.normal(0, 0.1, (seq_length, feature_dim))
        # Keystroke bursts: high dwell variance, irregular flight times
        X[idx, :, 14] = rng.exponential(0.5, seq_length)  # dwell
        X[idx, :, 15] = rng.exponential(0.3, seq_length)  # flight
        y[idx] = 1
        idx += 1
    
    # Copy-paste: zero corrections, high WPM
    for _ in range(num_copypaste):
        X[idx] = rng.normal(0, 0.1, (seq_length, feature_dim))
        X[idx, :, 16] = 2.0  # very high WPM
        X[idx, :, 17] = 0.0  # zero correction rate
        y[idx] = 1
        idx += 1
    
    # Phone-glance: off-axis gaze (pose/gaze features at indices 0-2)
    for _ in range(num_phone_glance):
        X[idx] = rng.normal(0, 0.1, (seq_length, feature_dim))
        # Periodic off-axis glances
        glance_frames = rng.choice(seq_length, 30, replace=False)
        X[idx, glance_frames, 0] = rng.uniform(0.5, 1.5, 30)  # yaw deviation
        X[idx, glance_frames, 1] = rng.uniform(0.3, 0.8, 30)  # pitch deviation
        y[idx] = 1
        idx += 1
    
    # Second-speaker: audio anomaly with gaze shift
    for _ in range(num_second_speaker):
        X[idx] = rng.normal(0, 0.1, (seq_length, feature_dim))
        # Audio energy spikes (index 18)
        speech_frames = rng.choice(seq_length, 40, replace=False)
        X[idx, speech_frames, 18] = rng.uniform(0.8, 2.0, 40)
        # Concurrent gaze shift
        X[idx, speech_frames, 0] = rng.uniform(0.3, 0.7, 40)
        y[idx] = 1
        idx += 1
    
    return X, y


def evaluate_model(
    model_weights: list[np.ndarray],
    X: np.ndarray,
    y: np.ndarray,
) -> tuple[float, float, float]:
    """
    Evaluate model on validation set.
    
    For the academic demo, we simulate prediction using a simple
    dot-product scoring on the weight magnitudes. In production,
    this would load the weights into a TF model and run inference.
    
    Returns: (precision, recall, accuracy)
    """
    # Simple threshold classifier based on weight-feature interaction
    # This is a stub — in production, run actual model inference
    total_weight_magnitude = sum(np.abs(w).mean() for w in model_weights)
    
    n = len(y)
    # Simulate predictions based on feature statistics
    predictions = np.zeros(n, dtype=np.float32)
    for i in range(n):
        # Use the mean absolute feature value as a proxy score
        score = np.abs(X[i]).mean()
        # Scale by model weight magnitude
        predictions[i] = 1 if score * total_weight_magnitude > 0.5 else 0
    
    true_labels = y.flatten()
    
    # Compute precision and recall
    tp = np.sum((predictions == 1) & (true_labels == 1))
    fp = np.sum((predictions == 1) & (true_labels == 0))
    fn = np.sum((predictions == 0) & (true_labels == 1))
    tn = np.sum((predictions == 0) & (true_labels == 0))
    
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    accuracy = (tp + tn) / n if n > 0 else 0.0
    
    return float(precision), float(recall), float(accuracy)


def validation_gate(
    model_weights: list[np.ndarray],
    baseline: ValidationBaseline,
    max_degradation: float = 0.02,
) -> ValidationResult:
    """
    Run the validation gate.
    
    Rejects the model if precision OR recall drops more than
    max_degradation relative to the baseline.
    """
    X, y = generate_synthetic_validation_set()
    precision, recall, accuracy = evaluate_model(model_weights, X, y)
    
    precision_drop = baseline.precision - precision
    recall_drop = baseline.recall - recall
    
    if precision_drop > max_degradation:
        return ValidationResult(
            precision=precision,
            recall=recall,
            accuracy=accuracy,
            accepted=False,
            reason=f"Precision dropped by {precision_drop:.4f} (>{max_degradation})",
        )
    
    if recall_drop > max_degradation:
        return ValidationResult(
            precision=precision,
            recall=recall,
            accuracy=accuracy,
            accepted=False,
            reason=f"Recall dropped by {recall_drop:.4f} (>{max_degradation})",
        )
    
    return ValidationResult(
        precision=precision,
        recall=recall,
        accuracy=accuracy,
        accepted=True,
        reason="Model accepted",
    )
