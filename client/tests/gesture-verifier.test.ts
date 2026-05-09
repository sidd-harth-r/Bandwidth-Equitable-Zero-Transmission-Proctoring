import { describe, expect, it } from "vitest";

import {
  generateChallenges,
  detectGesture,
  type LandmarkSnapshot,
} from "../src/exam/GestureVerifier";

describe("GestureVerifier — Challenge Generation", () => {
  it("generates the requested number of challenges", () => {
    const challenges = generateChallenges(3);
    expect(challenges.length).toBe(3);
  });

  it("generates at least 1 challenge with default count", () => {
    const challenges = generateChallenges();
    expect(challenges.length).toBeGreaterThanOrEqual(1);
  });

  it("never generates adjacent duplicate directions", () => {
    for (let run = 0; run < 20; run++) {
      const challenges = generateChallenges(5);
      for (let i = 1; i < challenges.length; i++) {
        expect(challenges[i].direction).not.toBe(challenges[i - 1].direction);
      }
    }
  });

  it("all challenges have a positive timeout", () => {
    const challenges = generateChallenges(5);
    for (const c of challenges) {
      expect(c.timeoutMs).toBeGreaterThan(0);
    }
  });
});

describe("GestureVerifier — Gesture Detection", () => {
  const baseline: LandmarkSnapshot = {
    nose: { x: 0.5, y: 0.3 },
    leftShoulder: { x: 0.35, y: 0.6 },
    rightShoulder: { x: 0.65, y: 0.6 },
  };

  it("detects leftward head movement", () => {
    const current: LandmarkSnapshot = {
      nose: { x: 0.38, y: 0.3 }, // Nose moved left relative to shoulders
      leftShoulder: { x: 0.35, y: 0.6 },
      rightShoulder: { x: 0.65, y: 0.6 },
    };
    expect(detectGesture("left", baseline, current)).toBe(true);
    expect(detectGesture("right", baseline, current)).toBe(false);
  });

  it("detects rightward head movement", () => {
    const current: LandmarkSnapshot = {
      nose: { x: 0.62, y: 0.3 },
      leftShoulder: { x: 0.35, y: 0.6 },
      rightShoulder: { x: 0.65, y: 0.6 },
    };
    expect(detectGesture("right", baseline, current)).toBe(true);
    expect(detectGesture("left", baseline, current)).toBe(false);
  });

  it("detects upward head movement", () => {
    const current: LandmarkSnapshot = {
      nose: { x: 0.5, y: 0.2 }, // Nose moved up
      leftShoulder: { x: 0.35, y: 0.6 },
      rightShoulder: { x: 0.65, y: 0.6 },
    };
    expect(detectGesture("up", baseline, current)).toBe(true);
    expect(detectGesture("down", baseline, current)).toBe(false);
  });

  it("detects downward nod", () => {
    const current: LandmarkSnapshot = {
      nose: { x: 0.5, y: 0.42 }, // Nose moved down
      leftShoulder: { x: 0.35, y: 0.6 },
      rightShoulder: { x: 0.65, y: 0.6 },
    };
    expect(detectGesture("down", baseline, current)).toBe(true);
    expect(detectGesture("nod", baseline, current)).toBe(true);
  });

  it("does NOT detect gesture when head is stationary", () => {
    const current: LandmarkSnapshot = {
      nose: { x: 0.5, y: 0.3 }, // Same as baseline
      leftShoulder: { x: 0.35, y: 0.6 },
      rightShoulder: { x: 0.65, y: 0.6 },
    };
    expect(detectGesture("left", baseline, current)).toBe(false);
    expect(detectGesture("right", baseline, current)).toBe(false);
    expect(detectGesture("up", baseline, current)).toBe(false);
    expect(detectGesture("down", baseline, current)).toBe(false);
  });

  it("compensates for shoulder movement (static image test)", () => {
    // If shoulders and nose move together (static image on screen), no gesture detected
    const current: LandmarkSnapshot = {
      nose: { x: 0.4, y: 0.3 }, // Moved left
      leftShoulder: { x: 0.25, y: 0.6 }, // Shoulders also moved left
      rightShoulder: { x: 0.55, y: 0.6 },
    };
    // Nose-relative-to-shoulders hasn't changed
    expect(detectGesture("left", baseline, current)).toBe(false);
  });
});
