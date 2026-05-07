import type { FusionResult, Tier } from "./types";

export class TierClassifier {
  classify(fusion: FusionResult): Tier {
    if (fusion.weighted_score > 0.85 && fusion.agreement_index < 0.15) {
      return "tier_1";
    }

    if (fusion.weighted_score > 0.6 || (fusion.weighted_score > 0.5 && fusion.agreement_index > 0.25)) {
      return "tier_2";
    }

    return "tier_3";
  }
}
