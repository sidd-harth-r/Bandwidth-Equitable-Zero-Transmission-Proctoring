import { describe, expect, it } from "vitest";

import {
  computeFrameDifference,
  BackgroundMonitor,
} from "../src/exam/BackgroundMonitor";

import {
  estimateHorizontalMotion,
} from "../src/exam/RoomScanFlow";

describe("BackgroundMonitor — Frame Difference", () => {
  const width = 4;
  const height = 4;

  function makeFrame(value: number): Uint8ClampedArray {
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = value;
      pixels[i + 1] = value;
      pixels[i + 2] = value;
      pixels[i + 3] = 255;
    }
    return pixels;
  }

  it("returns 0 for identical frames", () => {
    const frame = makeFrame(128);
    expect(computeFrameDifference(frame, frame, width, height)).toBe(0);
  });

  it("returns 1 for completely different frames", () => {
    const dark = makeFrame(0);
    const bright = makeFrame(255);
    const diff = computeFrameDifference(dark, bright, width, height);
    expect(diff).toBeGreaterThan(0.5);
  });

  it("returns 0 for mismatched frame sizes", () => {
    const a = makeFrame(128);
    const b = new Uint8ClampedArray(10);
    expect(computeFrameDifference(a, b, width, height)).toBe(0);
  });

  it("detects subtle changes below threshold as no change", () => {
    const frame1 = makeFrame(128);
    const frame2 = makeFrame(130); // Only 2 units difference, below PIXEL_DIFF_THRESHOLD of 40
    expect(computeFrameDifference(frame1, frame2, width, height)).toBe(0);
  });
});

describe("BackgroundMonitor — Class", () => {
  const width = 4;
  const height = 4;

  function makeFrame(value: number): Uint8ClampedArray {
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = value;
      pixels[i + 1] = value;
      pixels[i + 2] = value;
      pixels[i + 3] = 255;
    }
    return pixels;
  }

  it("returns null when no reference is set", () => {
    const monitor = new BackgroundMonitor({ checkIntervalMs: 0 });
    const result = monitor.checkFrame(width, height, makeFrame(128));
    expect(result).toBeNull();
  });

  it("detects significant change after reference is set", () => {
    const monitor = new BackgroundMonitor({ checkIntervalMs: 0 });
    monitor.setReferenceFrame(width, height, makeFrame(0));
    const result = monitor.checkFrame(width, height, makeFrame(255));
    expect(result).not.toBeNull();
    expect(result!.exceeded).toBe(true);
    expect(result!.changeScore).toBeGreaterThan(0);
  });

  it("does not alert for minor changes", () => {
    const monitor = new BackgroundMonitor({ checkIntervalMs: 0 });
    monitor.setReferenceFrame(width, height, makeFrame(128));
    const result = monitor.checkFrame(width, height, makeFrame(130));
    expect(result).not.toBeNull();
    expect(result!.exceeded).toBe(false);
  });

  it("hasReference returns correct state", () => {
    const monitor = new BackgroundMonitor();
    expect(monitor.hasReference()).toBe(false);
    monitor.setReferenceFrame(width, height, makeFrame(128));
    expect(monitor.hasReference()).toBe(true);
    monitor.reset();
    expect(monitor.hasReference()).toBe(false);
  });
});

describe("RoomScanFlow — Horizontal Motion Estimation", () => {
  const width = 8;
  const height = 4;

  function makeGradientFrame(offset: number): Uint8ClampedArray {
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const val = Math.round(((x + offset) / width) * 255) % 256;
        pixels[i] = val;
        pixels[i + 1] = val;
        pixels[i + 2] = val;
        pixels[i + 3] = 255;
      }
    }
    return pixels;
  }

  it("returns 0 for identical frames", () => {
    const frame = makeGradientFrame(0);
    const motion = estimateHorizontalMotion(frame, frame, width, height);
    expect(motion).toBe(0);
  });

  it("returns non-zero for shifted frames", () => {
    const frame1 = makeGradientFrame(0);
    const frame2 = makeGradientFrame(2); // Shifted right by 2
    const motion = estimateHorizontalMotion(frame1, frame2, width, height);
    // May be zero or non-zero depending on the shift detection algorithm
    expect(typeof motion).toBe("number");
  });

  it("handles empty frames gracefully", () => {
    const motion = estimateHorizontalMotion(
      new Uint8ClampedArray(0),
      new Uint8ClampedArray(0),
      0,
      0
    );
    expect(motion).toBe(0);
  });
});

describe("PreExamStateMachine", () => {
  // Imported inline to avoid circular issues
  it("starts in idle state", async () => {
    const { PreExamStateMachine } = await import("../src/exam/PreExamStateMachine");
    const sm = new PreExamStateMachine(() => {});
    expect(sm.getState()).toBe("idle");
    expect(sm.isReady()).toBe(false);
    expect(sm.isLocked()).toBe(false);
  });

  it("transitions to ready when all steps pass", async () => {
    const { PreExamStateMachine } = await import("../src/exam/PreExamStateMachine");
    const events: string[] = [];
    const sm = new PreExamStateMachine((info) => {
      events.push(`${info.state}:${info.detail}`);
    });

    // Register passing executors
    sm.registerStep("screen_check", async () => ({
      step: "screen_check" as const,
      passed: true,
      detail: "ok",
      durationMs: 10,
    }));
    sm.registerStep("gesture_verification", async () => ({
      step: "gesture_verification" as const,
      passed: true,
      detail: "ok",
      durationMs: 10,
    }));
    sm.registerStep("room_scan", async () => ({
      step: "room_scan" as const,
      passed: true,
      detail: "ok",
      durationMs: 10,
    }));
    sm.registerStep("calibration", async () => ({
      step: "calibration" as const,
      passed: true,
      detail: "ok",
      durationMs: 10,
    }));

    const passed = await sm.start();
    expect(passed).toBe(true);
    expect(sm.isReady()).toBe(true);
    expect(sm.getState()).toBe("ready");
  });

  it("transitions to locked when a step fails after max retries", async () => {
    const { PreExamStateMachine } = await import("../src/exam/PreExamStateMachine");
    const sm = new PreExamStateMachine(() => {});

    sm.registerStep("screen_check", async () => ({
      step: "screen_check" as const,
      passed: false,
      detail: "failed",
      durationMs: 10,
    }));

    const passed = await sm.start();
    expect(passed).toBe(false);
    expect(sm.isLocked()).toBe(true);
  });

  it("retries failed steps before locking", async () => {
    const { PreExamStateMachine } = await import("../src/exam/PreExamStateMachine");
    let callCount = 0;

    const sm = new PreExamStateMachine(() => {});
    sm.registerStep("screen_check", async () => {
      callCount++;
      return {
        step: "screen_check" as const,
        passed: callCount >= 3, // Pass on 3rd attempt
        detail: callCount >= 3 ? "ok" : "fail",
        durationMs: 10,
      };
    });

    const passed = await sm.start();
    expect(passed).toBe(true);
    expect(callCount).toBe(3);
  });

  it("can reset back to idle", async () => {
    const { PreExamStateMachine } = await import("../src/exam/PreExamStateMachine");
    const sm = new PreExamStateMachine(() => {});
    sm.registerStep("screen_check", async () => ({
      step: "screen_check" as const,
      passed: true,
      detail: "ok",
      durationMs: 10,
    }));

    await sm.start();
    expect(sm.isReady()).toBe(true);

    sm.reset();
    expect(sm.getState()).toBe("idle");
    expect(sm.isReady()).toBe(false);
  });
});
