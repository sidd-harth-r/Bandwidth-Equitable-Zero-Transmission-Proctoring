import type { FusionResult, Tier, TierThresholdConfig } from "./types";
import { DEFAULT_TIER_THRESHOLDS } from "./types";

export class TierClassifier {
  private thresholds: TierThresholdConfig;

  constructor(thresholds?: Partial<TierThresholdConfig>) {
    this.thresholds = {
      ...DEFAULT_TIER_THRESHOLDS,
      ...thresholds,
    };
  }

  /**
   * Update tier thresholds at runtime (e.g. after session-history
   * prior fetch adjusts sensitivity).
   */
  updateThresholds(patch: Partial<TierThresholdConfig>): void {
    Object.assign(this.thresholds, patch);
  }

  getThresholds(): Readonly<TierThresholdConfig> {
    return { ...this.thresholds };
  }

  classify(fusion: FusionResult): Tier {
    const { weighted_score, agreement_index } = fusion;
    const t = this.thresholds;

    // Tier 1: Deterministic violation — high score with strong channel agreement
    if (
      weighted_score > t.tier1ScoreThreshold &&
      agreement_index < t.tier1AgreementCeiling
    ) {
      return "tier_1";
    }

    // Tier 2: Human review needed — elevated score or disagreeing channels
    if (
      weighted_score > t.tier2ScoreThreshold ||
      (weighted_score > t.tier2DisagreementScoreThreshold &&
        agreement_index > t.tier2DisagreementFloor)
    ) {
      return "tier_2";
    }

    // Tier 3: Normal — no action needed
    return "tier_3";
  }
}
