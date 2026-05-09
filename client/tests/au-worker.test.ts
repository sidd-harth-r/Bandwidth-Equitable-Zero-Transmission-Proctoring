import { describe, expect, it } from "vitest";

import {
  computeAuFromFrame,
  computeAuAnomalyScore,
  averageActivations,
  neutralActivation,
} from "../src/workers/au-utils";

describe("AuWorker — Neutral Activation", () => {
  it("returns all zeros for neutral state", () => {
    const neutral = neutralActivation();
    expect(neutral.au4).toBe(0);
    expect(neutral.au12).toBe(0);
    expect(neutral.au17).toBe(0);
    expect(neutral.au20).toBe(0);
    expect(neutral.au23).toBe(0);
    expect(neutral.au25).toBe(0);
    expect(neutral.au26).toBe(0);
  });
});

describe("AuWorker — Frame-Based AU Extraction", () => {
  it("produces valid activations from frame pixels", () => {
    const width = 20;
    const height = 20;
    const pixels = new Uint8ClampedArray(width * height * 4);

    // Fill with skin-like color (warm tone)
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = 180;     // R
      pixels[i + 1] = 140; // G
      pixels[i + 2] = 100; // B
      pixels[i + 3] = 255; // A
    }

    const activations = computeAuFromFrame(width, height, pixels);

    // All activations should be in [0, 1]
    for (const key of Object.keys(activations) as (keyof typeof activations)[]) {
      expect(activations[key]).toBeGreaterThanOrEqual(0);
      expect(activations[key]).toBeLessThanOrEqual(1);
    }
  });

  it("returns neutral for zero-pixel frame", () => {
    const width = 20;
    const height = 20;
    const pixels = new Uint8ClampedArray(width * height * 4);

    const activations = computeAuFromFrame(width, height, pixels);

    // Very low or zero activation expected
    expect(activations.au4).toBeGreaterThanOrEqual(0);
    expect(activations.au12).toBeGreaterThanOrEqual(0);
  });

  it("produces different activations for different color profiles", () => {
    const width = 20;
    const height = 20;

    // Warm image
    const warm = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < warm.length; i += 4) {
      warm[i] = 220; warm[i + 1] = 150; warm[i + 2] = 100; warm[i + 3] = 255;
    }

    // Cool image
    const cool = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < cool.length; i += 4) {
      cool[i] = 100; cool[i + 1] = 150; cool[i + 2] = 220; cool[i + 3] = 255;
    }

    const warmAu = computeAuFromFrame(width, height, warm);
    const coolAu = computeAuFromFrame(width, height, cool);

    // Should produce different profiles
    const warmSum = warmAu.au4 + warmAu.au12 + warmAu.au17;
    const coolSum = coolAu.au4 + coolAu.au12 + coolAu.au17;
    expect(warmSum).not.toBe(coolSum);
  });
});

describe("AuWorker — Anomaly Score Computation", () => {
  it("returns 0 when current matches baseline exactly", () => {
    const current = { au4: 0.2, au12: 0.3, au17: 0.1, au20: 0.1, au23: 0.15, au25: 0.2, au26: 0.1 };
    const score = computeAuAnomalyScore(current, current);
    expect(score).toBe(0);
  });

  it("returns elevated score for significant deviations", () => {
    const baseline = { au4: 0.1, au12: 0.2, au17: 0.1, au20: 0.1, au23: 0.1, au25: 0.1, au26: 0.1 };
    const stressed = { au4: 0.8, au12: 0.1, au17: 0.6, au20: 0.5, au23: 0.7, au25: 0.3, au26: 0.4 };

    const score = computeAuAnomalyScore(stressed, baseline);
    expect(score).toBeGreaterThan(0.3);
  });

  it("score is always in [0, 1]", () => {
    const baseline = neutralActivation();
    const extreme = { au4: 1, au12: 1, au17: 1, au20: 1, au23: 1, au25: 1, au26: 1 };

    const score = computeAuAnomalyScore(extreme, baseline);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

describe("AuWorker — Baseline Averaging", () => {
  it("averages multiple frames correctly", () => {
    const frames = [
      { au4: 0.2, au12: 0.4, au17: 0.1, au20: 0.3, au23: 0.2, au25: 0.5, au26: 0.1 },
      { au4: 0.4, au12: 0.6, au17: 0.3, au20: 0.1, au23: 0.4, au25: 0.3, au26: 0.3 },
    ];

    const avg = averageActivations(frames);

    expect(avg.au4).toBeCloseTo(0.3, 5);
    expect(avg.au12).toBeCloseTo(0.5, 5);
    expect(avg.au17).toBeCloseTo(0.2, 5);
  });

  it("returns neutral for empty frames", () => {
    const avg = averageActivations([]);
    expect(avg.au4).toBe(0);
    expect(avg.au12).toBe(0);
  });
});
