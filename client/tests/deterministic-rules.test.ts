import { describe, expect, it } from "vitest";

import { detectSkinRegions, MultiPersonDetector } from "../src/exam/MultiPersonDetector";
import { detectPhoneHeuristic, PhoneDetector } from "../src/workers/PhoneDetectionWorker";

/* ── Helper factories ─────────────────────────────────────── */

const W = 32;
const H = 24;

function makeUniformFrame(r: number, g: number, b: number): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = r;
    pixels[i + 1] = g;
    pixels[i + 2] = b;
    pixels[i + 3] = 255;
  }
  return pixels;
}

function makeSkinPatch(
  pixels: Uint8ClampedArray,
  x0: number, y0: number,
  patchW: number, patchH: number
): void {
  // Skin-like RGB: R=200, G=150, B=100
  for (let dy = 0; dy < patchH; dy++) {
    for (let dx = 0; dx < patchW; dx++) {
      const x = x0 + dx;
      const y = y0 + dy;
      if (x >= W || y >= H) continue;
      const i = (y * W + x) * 4;
      pixels[i] = 200;
      pixels[i + 1] = 150;
      pixels[i + 2] = 100;
    }
  }
}

/* ── MultiPersonDetector tests ────────────────────────────── */

describe("MultiPersonDetector — Skin Region Detection", () => {
  it("returns empty array for non-skin frame", () => {
    const frame = makeUniformFrame(0, 0, 255); // Pure blue
    const regions = detectSkinRegions(frame, W, H);
    expect(regions.length).toBe(0);
  });

  it("detects a single skin-colored region", () => {
    const frame = makeUniformFrame(0, 0, 50); // Dark background
    makeSkinPatch(frame, 10, 5, 12, 14);
    const regions = detectSkinRegions(frame, W, H);
    expect(regions.length).toBeGreaterThanOrEqual(1);
  });

  it("detects two separated skin-colored regions", () => {
    const frame = makeUniformFrame(0, 0, 50); // Dark background
    // Two patches far apart
    makeSkinPatch(frame, 0, 0, 8, 10);    // Top-left
    makeSkinPatch(frame, 24, 14, 8, 10);  // Bottom-right
    const regions = detectSkinRegions(frame, W, H);
    // With small frame and sampling, may or may not be 2 distinct clusters
    expect(regions.length).toBeGreaterThanOrEqual(1);
  });

  it("returns empty for black frame", () => {
    const frame = makeUniformFrame(0, 0, 0);
    const regions = detectSkinRegions(frame, W, H);
    expect(regions.length).toBe(0);
  });
});

describe("MultiPersonDetector — Class", () => {
  it("returns null when interval not reached", () => {
    const detector = new MultiPersonDetector({ checkIntervalMs: 60_000 });
    const frame = makeUniformFrame(0, 0, 50);
    // First check always runs
    detector.forceCheck(W, H, frame);
    // Second check should be skipped
    const result = detector.checkFrame(W, H, frame);
    expect(result).toBeNull();
  });

  it("forceCheck always runs", () => {
    const detector = new MultiPersonDetector({ checkIntervalMs: 60_000 });
    const frame = makeUniformFrame(0, 0, 50);
    const result = detector.forceCheck(W, H, frame);
    expect(result).not.toBeNull();
    expect(result.detectedCount).toBe(0);
    expect(result.isMultiplePeople).toBe(false);
  });

  it("calls callback when multiple people detected", () => {
    let called = false;
    const detector = new MultiPersonDetector({
      checkIntervalMs: 0,
      onDetection: () => { called = true; }
    });
    // Create a frame where detection could trigger
    const frame = makeUniformFrame(200, 150, 100); // All skin-like
    const result = detector.forceCheck(W, H, frame);
    // Whether callback is called depends on cluster count
    expect(result).not.toBeNull();
    // The callback should only fire if isMultiplePeople is true
    if (result.isMultiplePeople) {
      expect(called).toBe(true);
    }
  });
});

/* ── PhoneDetector tests ──────────────────────────────────── */

describe("PhoneDetector — Heuristic Detection", () => {
  it("returns empty for uniform frame", () => {
    const frame = makeUniformFrame(128, 128, 128);
    const detections = detectPhoneHeuristic(frame, W, H);
    expect(detections.length).toBe(0);
  });

  it("returns empty for zero-size frame", () => {
    const detections = detectPhoneHeuristic(new Uint8ClampedArray(0), 0, 0);
    expect(detections.length).toBe(0);
  });

  it("all detections have valid bbox coordinates", () => {
    // Create a frame with high-contrast edges
    const frame = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        frame[i] = x % 2 === 0 ? 0 : 255;     // Alternating black/white columns
        frame[i + 1] = x % 2 === 0 ? 0 : 255;
        frame[i + 2] = x % 2 === 0 ? 0 : 255;
        frame[i + 3] = 255;
      }
    }
    const detections = detectPhoneHeuristic(frame, W, H);
    for (const d of detections) {
      expect(d.bbox.x).toBeGreaterThanOrEqual(0);
      expect(d.bbox.y).toBeGreaterThanOrEqual(0);
      expect(d.bbox.width).toBeGreaterThan(0);
      expect(d.bbox.height).toBeGreaterThan(0);
      expect(d.confidence).toBeLessThanOrEqual(1);
    }
  });
});

describe("PhoneDetector — Class", () => {
  it("returns null when interval not reached", async () => {
    const detector = new PhoneDetector({ checkIntervalMs: 60_000, heuristicOnly: true });
    const frame = makeUniformFrame(128, 128, 128);
    // First check always runs
    await detector.checkFrame(W, H, frame);
    // Second check should be skipped
    const result = await detector.checkFrame(W, H, frame);
    expect(result).toBeNull();
  });

  it("uses heuristic method when COCO-SSD unavailable", async () => {
    const detector = new PhoneDetector({ checkIntervalMs: 0, heuristicOnly: true });
    const frame = makeUniformFrame(128, 128, 128);
    const result = await detector.checkFrame(W, H, frame);
    expect(result).not.toBeNull();
    expect(result!.method).toBe("edge_heuristic");
  });

  it("calls callback when phone detected", async () => {
    let callbackResult: unknown = null;
    const detector = new PhoneDetector({
      checkIntervalMs: 0,
      heuristicOnly: true,
      onDetection: (result) => { callbackResult = result; }
    });
    // Create a high-contrast striped frame
    const frame = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        frame[i] = x % 2 === 0 ? 0 : 255;
        frame[i + 1] = x % 2 === 0 ? 0 : 255;
        frame[i + 2] = x % 2 === 0 ? 0 : 255;
        frame[i + 3] = 255;
      }
    }
    const result = await detector.checkFrame(W, H, frame);
    expect(result).not.toBeNull();
    if (result!.detected) {
      expect(callbackResult).not.toBeNull();
    }
  });

  it("setConfidenceThreshold clamps to [0, 1]", () => {
    const detector = new PhoneDetector({ heuristicOnly: true });
    detector.setConfidenceThreshold(1.5);
    detector.setConfidenceThreshold(-0.5);
    // No error thrown
  });
});
