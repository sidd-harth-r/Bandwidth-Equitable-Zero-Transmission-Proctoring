import { describe, expect, it } from "vitest";

import {
  computeKeystrokeScore,
  mean,
  variance,
} from "../src/workers/keystroke-utils";

describe("KeystrokeWorker — Math Utilities", () => {
  it("computes mean of an array", () => {
    expect(mean([1, 2, 3, 4, 5])).toBe(3);
  });

  it("returns 0 for empty array", () => {
    expect(mean([])).toBe(0);
  });

  it("computes variance of an array", () => {
    const v = variance([2, 4, 6, 8]);
    expect(v).toBeCloseTo(5, 5);
  });

  it("returns 0 variance for single element", () => {
    expect(variance([42])).toBe(0);
  });

  it("returns 0 variance for constant array", () => {
    expect(variance([5, 5, 5, 5])).toBe(0);
  });
});

describe("KeystrokeWorker — Score Computation", () => {
  it("returns 0 when current matches baseline", () => {
    const features = {
      dwellMean: 100,
      dwellVariance: 50,
      flightMean: 150,
      flightVariance: 80,
      backspaceRate: 0.05,
      pasteRatio: 0,
    };

    const score = computeKeystrokeScore(features, features);
    expect(score).toBe(0);
  });

  it("detects elevated score from dwell time changes", () => {
    const baseline = {
      dwellMean: 100,
      dwellVariance: 50,
      flightMean: 150,
      flightVariance: 80,
      backspaceRate: 0.05,
      pasteRatio: 0,
    };

    const changed = {
      ...baseline,
      dwellMean: 200, // 100% increase
    };

    const score = computeKeystrokeScore(changed, baseline);
    expect(score).toBeGreaterThan(0.1);
  });

  it("detects elevated score from flight time changes", () => {
    const baseline = {
      dwellMean: 100,
      dwellVariance: 50,
      flightMean: 150,
      flightVariance: 80,
      backspaceRate: 0.05,
      pasteRatio: 0,
    };

    const changed = {
      ...baseline,
      flightMean: 300, // Doubled
    };

    const score = computeKeystrokeScore(changed, baseline);
    expect(score).toBeGreaterThan(0.1);
  });

  it("heavily penalizes high paste ratio", () => {
    const baseline = {
      dwellMean: 100,
      dwellVariance: 50,
      flightMean: 150,
      flightVariance: 80,
      backspaceRate: 0.05,
      pasteRatio: 0,
    };

    const pasting = {
      ...baseline,
      pasteRatio: 0.8, // 80% pasted content
    };

    const score = computeKeystrokeScore(pasting, baseline);
    expect(score).toBeGreaterThan(0.15);
  });

  it("detects elevated backspace rate", () => {
    const baseline = {
      dwellMean: 100,
      dwellVariance: 50,
      flightMean: 150,
      flightVariance: 80,
      backspaceRate: 0.05,
      pasteRatio: 0,
    };

    const excessive = {
      ...baseline,
      backspaceRate: 0.40, // Much higher than baseline
    };

    const score = computeKeystrokeScore(excessive, baseline);
    expect(score).toBeGreaterThan(0.1);
  });

  it("score is always in [0, 1]", () => {
    const baseline = {
      dwellMean: 1,
      dwellVariance: 1,
      flightMean: 1,
      flightVariance: 1,
      backspaceRate: 0,
      pasteRatio: 0,
    };

    const extreme = {
      dwellMean: 1000,
      dwellVariance: 10000,
      flightMean: 5000,
      flightVariance: 50000,
      backspaceRate: 1,
      pasteRatio: 1,
    };

    const score = computeKeystrokeScore(extreme, baseline);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("does not store or compare key content", () => {
    // This test documents the privacy invariant:
    // The computeKeystrokeScore function only uses timing features,
    // never key identity or content.
    const features = {
      dwellMean: 100,
      dwellVariance: 50,
      flightMean: 150,
      flightVariance: 80,
      backspaceRate: 0.05,
      pasteRatio: 0,
    };

    // Function signature only accepts KeystrokeFeatures, not raw keys
    expect(typeof computeKeystrokeScore).toBe("function");
    expect(computeKeystrokeScore(features, features)).toBe(0);
  });
});
