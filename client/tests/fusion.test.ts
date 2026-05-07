import { describe, expect, it } from "vitest";

import { FusionEngine } from "../src/coordinator/FusionEngine";
import { TierClassifier } from "../src/coordinator/TierClassifier";

describe("FusionEngine", () => {
  it("uses pose/gaze as the Phase 1 weighted score", () => {
    const result = new FusionEngine().fuse({
      pose_gaze: 0.72,
      rppg: 0,
      au: 0,
      keystroke: 0
    });

    expect(result.weighted_score).toBe(0.72);
    expect(result.channel_scores.pose_gaze).toBe(0.72);
  });

  it("clamps invalid channel values to the privacy-safe score range", () => {
    const result = new FusionEngine().fuse({
      pose_gaze: 2,
      rppg: -1,
      au: Number.NaN,
      keystroke: 0.5
    });

    expect(result.channel_scores).toEqual({
      pose_gaze: 1,
      rppg: 0,
      au: 0,
      keystroke: 0.5
    });
  });
});

describe("TierClassifier", () => {
  it("routes elevated Phase 1 scores to human review", () => {
    const fusion = new FusionEngine().fuse({
      pose_gaze: 0.72,
      rppg: 0,
      au: 0,
      keystroke: 0
    });

    expect(new TierClassifier().classify(fusion)).toBe("tier_2");
  });
});
