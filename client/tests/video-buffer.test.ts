import { describe, expect, it } from "vitest";

import { VideoRingBuffer } from "../src/exam/VideoRingBuffer";
import { encodeClip, estimateClipSize } from "../src/exam/ClipUploader";

/* ── Helpers ──────────────────────────────────────────────── */

function makePixels(width: number, height: number, value: number): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = value;
    pixels[i + 1] = value;
    pixels[i + 2] = value;
    pixels[i + 3] = 255;
  }
  return pixels;
}

/* ── VideoRingBuffer tests ────────────────────────────────── */

describe("VideoRingBuffer — Basic Operations", () => {
  it("starts empty", () => {
    const buffer = new VideoRingBuffer({ maxFrames: 10 });
    expect(buffer.getFrameCount()).toBe(0);
    expect(buffer.getCapacity()).toBe(10);
    expect(buffer.getMemoryUsageBytes()).toBe(0);
  });

  it("accepts frames up to capacity", () => {
    const buffer = new VideoRingBuffer({ maxFrames: 5 });
    for (let i = 0; i < 5; i++) {
      buffer.pushFrame(4, 4, makePixels(4, 4, i * 50));
    }
    expect(buffer.getFrameCount()).toBe(5);
  });

  it("overwrites oldest frames when full", () => {
    const buffer = new VideoRingBuffer({ maxFrames: 3 });
    for (let i = 0; i < 5; i++) {
      buffer.pushFrame(4, 4, makePixels(4, 4, i * 50));
    }
    // Still 3 frames — the 2 oldest are overwritten
    expect(buffer.getFrameCount()).toBe(3);
  });

  it("tracks memory usage", () => {
    const buffer = new VideoRingBuffer({ maxFrames: 5 });
    const pixelData = makePixels(4, 4, 128);
    buffer.pushFrame(4, 4, pixelData);
    expect(buffer.getMemoryUsageBytes()).toBe(4 * 4 * 4); // 64 bytes
  });

  it("clears all frames", () => {
    const buffer = new VideoRingBuffer({ maxFrames: 5 });
    buffer.pushFrame(4, 4, makePixels(4, 4, 128));
    buffer.pushFrame(4, 4, makePixels(4, 4, 200));
    buffer.clear();
    expect(buffer.getFrameCount()).toBe(0);
    expect(buffer.getMemoryUsageBytes()).toBe(0);
  });

  it("copies pixels to prevent external mutation", () => {
    const buffer = new VideoRingBuffer({ maxFrames: 5 });
    const pixels = makePixels(4, 4, 128);
    buffer.pushFrame(4, 4, pixels);
    // Mutate the original
    pixels[0] = 255;
    // Buffer should have the original value
    const clip = buffer.extractClip(Date.now(), 10_000, 10_000);
    expect(clip.frames[0].pixels[0]).toBe(128);
  });
});

describe("VideoRingBuffer — Clip Extraction", () => {
  it("extracts frames within time window", () => {
    const buffer = new VideoRingBuffer({ maxFrames: 100 });
    const now = Date.now();

    // Push frames at known timestamps
    for (let i = 0; i < 10; i++) {
      buffer.pushFrame(4, 4, makePixels(4, 4, i * 25));
    }

    const clip = buffer.extractClip(now, 5_000, 5_000);
    expect(clip.triggerTimestamp).toBe(now);
    // Frames pushed just now should be within the window
    expect(clip.frames.length).toBeGreaterThanOrEqual(1);
  });

  it("returns empty clip for timestamp far in the past", () => {
    const buffer = new VideoRingBuffer({ maxFrames: 10 });
    buffer.pushFrame(4, 4, makePixels(4, 4, 128));
    const clip = buffer.extractClip(0, 1_000, 1_000); // Timestamp = 0
    expect(clip.frames.length).toBe(0);
    expect(clip.durationMs).toBe(0);
  });

  it("includes correct metadata in clip", () => {
    const buffer = new VideoRingBuffer({ maxFrames: 10 });
    const trigger = Date.now();
    buffer.pushFrame(4, 4, makePixels(4, 4, 128));

    const clip = buffer.extractClip(trigger, 10_000, 10_000);
    expect(clip.triggerTimestamp).toBe(trigger);
    if (clip.frames.length > 0) {
      expect(clip.startTimestamp).toBeLessThanOrEqual(clip.endTimestamp);
      expect(clip.durationMs).toBeGreaterThanOrEqual(0);
    }
  });
});

/* ── ClipUploader encoding tests ──────────────────────────── */

describe("ClipUploader — Encoding", () => {
  it("encodes clip to a non-empty blob", () => {
    const buffer = new VideoRingBuffer({ maxFrames: 10 });
    buffer.pushFrame(4, 4, makePixels(4, 4, 128));
    buffer.pushFrame(4, 4, makePixels(4, 4, 200));

    const clip = buffer.extractClip(Date.now(), 10_000, 10_000);
    const blob = encodeClip(clip, {
      sessionId: "test-session",
      studentId: "test-student",
      eventId: "evt-001",
      triggerTimestamp: Date.now(),
      startTimestamp: clip.startTimestamp,
      endTimestamp: clip.endTimestamp,
      frameCount: clip.frames.length,
      durationMs: clip.durationMs,
      tier: "tier_2",
    });

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it("estimates clip size correctly", () => {
    const buffer = new VideoRingBuffer({ maxFrames: 10 });
    buffer.pushFrame(4, 4, makePixels(4, 4, 128));
    const clip = buffer.extractClip(Date.now(), 10_000, 10_000);

    const estimated = estimateClipSize(clip);
    expect(estimated).toBeGreaterThan(0);
    if (clip.frames.length > 0) {
      expect(estimated).toBeGreaterThan(256); // At least header overhead
    }
  });

  it("encodes empty clip without error", () => {
    const clip = {
      frames: [],
      startTimestamp: 0,
      endTimestamp: 0,
      durationMs: 0,
      triggerTimestamp: 0,
    };
    const blob = encodeClip(clip, {
      sessionId: "s1",
      studentId: "u1",
      eventId: "e1",
      triggerTimestamp: 0,
      startTimestamp: 0,
      endTimestamp: 0,
      frameCount: 0,
      durationMs: 0,
      tier: "tier_2",
    });
    expect(blob.size).toBeGreaterThan(0); // Header still present
  });
});
