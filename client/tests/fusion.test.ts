import { describe, expect, it } from "vitest";

import { FusionEngine } from "../src/coordinator/FusionEngine";
import { TierClassifier } from "../src/coordinator/TierClassifier";

describe("FusionEngine", () => {
  it("uses configured weights for weighted score (Phase 1 single-channel mode)", () => {
    // Phase 1 backward-compat: only pose/gaze active, weight=1
    const engine = new FusionEngine({ pose_gaze: 1, rppg: 0, au: 0, keystroke: 0 });
    const result = engine.fuse({
      pose_gaze: 0.72,
      rppg: 0,
      au: 0,
      keystroke: 0
    });

    expect(result.weighted_score).toBe(0.72);
    expect(result.channel_scores.pose_gaze).toBe(0.72);
  });

  it("uses default multi-channel weights when no config specified", () => {
    const engine = new FusionEngine();
    const result = engine.fuse({
      pose_gaze: 0.72,
      rppg: 0,
      au: 0,
      keystroke: 0
    });

    // Default weights: pose_gaze=0.35, rppg=0.20, au=0.25, keystroke=0.20
    // weighted = (0.72*0.35 + 0*0.20 + 0*0.25 + 0*0.20) / 1.0 = 0.252
    expect(result.weighted_score).toBe(0.252);
    expect(result.channel_scores.pose_gaze).toBe(0.72);
  });

  it("computes correct multi-channel weighted score", () => {
    const engine = new FusionEngine();
    const result = engine.fuse({
      pose_gaze: 0.6,
      rppg: 0.4,
      au: 0.5,
      keystroke: 0.3
    });

    // (0.6*0.35 + 0.4*0.20 + 0.5*0.25 + 0.3*0.20) / 1.0
    // = (0.21 + 0.08 + 0.125 + 0.06) / 1.0 = 0.475
    expect(result.weighted_score).toBe(0.475);
  });

  it("clamps invalid channel values to the privacy-safe score range", () => {
    const engine = new FusionEngine();
    const result = engine.fuse({
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

  it("allows runtime weight updates", () => {
    const engine = new FusionEngine();
    engine.updateWeights({ pose_gaze: 1, rppg: 0, au: 0, keystroke: 0 });

    const result = engine.fuse({
      pose_gaze: 0.8,
      rppg: 0.5,
      au: 0.3,
      keystroke: 0.2
    });

    expect(result.weighted_score).toBe(0.8);
  });
});

describe("TierClassifier", () => {
  it("routes high-agreement elevated scores to Tier 1", () => {
    const classifier = new TierClassifier();
    const engine = new FusionEngine();
    const fusion = engine.fuse({
      pose_gaze: 0.95,
      rppg: 0.90,
      au: 0.92,
      keystroke: 0.88
    });

    // All channels agree on high scores → low agreement_index, high weighted_score
    // This should be tier_1 (deterministic violation)
    expect(fusion.weighted_score).toBeGreaterThan(0.85);
    expect(fusion.agreement_index).toBeLessThan(0.15);
    expect(classifier.classify(fusion)).toBe("tier_1");
  });

  it("routes elevated Phase 1 scores to human review (Tier 2)", () => {
    const classifier = new TierClassifier();
    const engine = new FusionEngine({ pose_gaze: 1, rppg: 0, au: 0, keystroke: 0 });
    const fusion = engine.fuse({
      pose_gaze: 0.72,
      rppg: 0,
      au: 0,
      keystroke: 0
    });

    // weighted_score = 0.72 > 0.6 → tier_2
    expect(classifier.classify(fusion)).toBe("tier_2");
  });

  it("routes multi-channel disagreement to Tier 2", () => {
    const classifier = new TierClassifier();
    const engine = new FusionEngine();
    const fusion = engine.fuse({
      pose_gaze: 0.8,
      rppg: 0.1,
      au: 0.7,
      keystroke: 0.2
    });

    // High disagreement between channels → tier_2
    expect(classifier.classify(fusion)).toBe("tier_2");
  });

  it("routes low scores to Tier 3", () => {
    const classifier = new TierClassifier();
    const engine = new FusionEngine();
    const fusion = engine.fuse({
      pose_gaze: 0.1,
      rppg: 0.1,
      au: 0.1,
      keystroke: 0.1
    });

    expect(classifier.classify(fusion)).toBe("tier_3");
  });

  it("allows runtime threshold updates", () => {
    const classifier = new TierClassifier();
    classifier.updateThresholds({ tier2ScoreThreshold: 0.3 });

    const engine = new FusionEngine();
    const fusion = engine.fuse({
      pose_gaze: 0.4,
      rppg: 0.3,
      au: 0.4,
      keystroke: 0.3
    });

    // With lowered threshold, moderate scores now reach tier_2
    expect(classifier.classify(fusion)).toBe("tier_2");
  });
});
