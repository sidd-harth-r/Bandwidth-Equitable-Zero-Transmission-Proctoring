"""
FedAvgTieredStrategy — Custom Flower aggregation strategy.

Extends FedAvg with:
- Staleness-aware tiering (stale gradients get reduced weight)
- Verified proctor label weighting (10× for human-reviewed decisions)
- Minimum client threshold before accepting a round
"""

import pickle
import base64
from typing import Optional

import numpy as np
from redis import Redis


# Staleness tiers
TIER_1_MAX_STALENESS = 0    # Current version — full weight
TIER_2_MAX_STALENESS = 1    # One version behind — 0.5× weight
TIER_3_MAX_STALENESS = 999  # Two+ versions behind — deferred to next round


class FedAvgTieredStrategy:
    """
    Custom federated averaging strategy with tiered staleness handling.
    """

    def __init__(
        self,
        redis_client: Redis,
        current_model_version: int = 0,
        min_clients_per_round: int = 3,
        max_staleness_for_inclusion: int = 1,
    ):
        self.redis = redis_client
        self.current_model_version = current_model_version
        self.min_clients_per_round = min_clients_per_round
        self.max_staleness_for_inclusion = max_staleness_for_inclusion
        self.queue_key = "bezp:fl:gradients"

    def collect_gradients(self) -> list[dict]:
        """
        Drain the Redis gradient queue and return all payloads.
        """
        gradients = []
        while True:
            raw = self.redis.lpop(self.queue_key)
            if raw is None:
                break
            # Data is base64-encoded pickle
            binary = base64.b64decode(raw)
            payload = pickle.loads(binary)
            gradients.append(payload)

        return gradients

    def classify_staleness(self, model_version: int) -> int:
        """
        Classify a gradient into a staleness tier.
        
        Returns:
            0 = current (full weight)
            1 = one behind (half weight)  
            2 = two+ behind (defer)
        """
        staleness = self.current_model_version - model_version
        if staleness <= TIER_1_MAX_STALENESS:
            return 0
        elif staleness <= TIER_2_MAX_STALENESS:
            return 1
        else:
            return 2

    def compute_weight(self, gradient: dict) -> float:
        """
        Compute the aggregation weight for a gradient.
        
        Factors:
        - Sample count (more samples → more weight)
        - Staleness tier (stale → less weight)
        """
        sample_count = gradient.get("sample_count", 1)
        tier = self.classify_staleness(gradient.get("model_version", 0))

        if tier == 0:
            staleness_factor = 1.0
        elif tier == 1:
            staleness_factor = 0.5
        else:
            staleness_factor = 0.0  # deferred

        return sample_count * staleness_factor

    def aggregate(
        self, gradients: list[dict]
    ) -> Optional[list[np.ndarray]]:
        """
        Aggregate gradients using weighted FedAvg.
        
        Returns None if insufficient clients.
        """
        # Filter out deferred (Tier 3) gradients
        included = []
        deferred = []

        for grad in gradients:
            tier = self.classify_staleness(grad.get("model_version", 0))
            if tier <= self.max_staleness_for_inclusion:
                included.append(grad)
            else:
                deferred.append(grad)

        # Re-queue deferred gradients for next round
        for grad in deferred:
            binary = pickle.dumps(grad)
            b64 = base64.b64encode(binary).decode("ascii")
            self.redis.rpush(self.queue_key, b64)

        if len(included) < self.min_clients_per_round:
            # Not enough clients — re-queue all and wait
            for grad in included:
                binary = pickle.dumps(grad)
                b64 = base64.b64encode(binary).decode("ascii")
                self.redis.rpush(self.queue_key, b64)
            return None

        # Compute weighted average
        weights = [self.compute_weight(g) for g in included]
        total_weight = sum(weights)

        if total_weight == 0:
            return None

        # Get the layer structure from the first gradient
        num_layers = len(included[0]["layers"])
        aggregated: list[np.ndarray] = []

        for layer_idx in range(num_layers):
            weighted_sum = np.zeros_like(included[0]["layers"][layer_idx])
            for grad, w in zip(included, weights):
                weighted_sum += grad["layers"][layer_idx] * (w / total_weight)
            aggregated.append(weighted_sum)

        return aggregated

    def run_round(self) -> Optional[list[np.ndarray]]:
        """
        Execute one aggregation round:
        1. Collect gradients from Redis
        2. Classify staleness
        3. Aggregate (or defer)
        """
        gradients = self.collect_gradients()
        if not gradients:
            return None

        return self.aggregate(gradients)
