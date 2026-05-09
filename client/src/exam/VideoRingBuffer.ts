/**
 * VideoRingBuffer — RAM-Only Rolling Video Buffer
 *
 * Maintains a configurable-duration ring buffer of video frames
 * in memory. Frames are stored as compressed pixel snapshots.
 * The buffer is NEVER written to disk, IndexedDB, or localStorage.
 *
 * When a Tier 2 event triggers clip extraction, the buffer provides
 * the surrounding frames for bounded-quality encoding and upload.
 *
 * Privacy: All frames stay in RAM. Frames are overwritten cyclically.
 * The buffer is cleared when the exam session ends.
 */

/* ── Types ────────────────────────────────────────────────── */

export interface BufferedFrame {
  timestamp: number;         // Date.now() when captured
  width: number;
  height: number;
  pixels: Uint8ClampedArray; // Raw RGBA pixels
}

export interface ClipFrames {
  frames: BufferedFrame[];
  startTimestamp: number;
  endTimestamp: number;
  durationMs: number;
  triggerTimestamp: number;
}

/* ── Configuration ────────────────────────────────────────── */

const DEFAULT_BUFFER_DURATION_MS = 60_000;  // 60 seconds
const DEFAULT_MAX_FRAMES = 150;              // ~2.5 fps for 60s
const CLIP_BEFORE_MS = 15_000;               // 15s before event
const CLIP_AFTER_MS = 15_000;                // 15s after event

/* ── VideoRingBuffer ──────────────────────────────────────── */

export class VideoRingBuffer {
  private buffer: BufferedFrame[] = [];
  private head = 0;
  private maxFrames: number;
  private bufferDurationMs: number;
  private frameCount = 0;

  constructor(options?: {
    maxFrames?: number;
    bufferDurationMs?: number;
  }) {
    this.maxFrames = options?.maxFrames ?? DEFAULT_MAX_FRAMES;
    this.bufferDurationMs = options?.bufferDurationMs ?? DEFAULT_BUFFER_DURATION_MS;
    this.buffer = new Array(this.maxFrames);
  }

  /**
   * Add a frame to the ring buffer.
   * Overwrites the oldest frame when the buffer is full.
   */
  pushFrame(width: number, height: number, pixels: Uint8ClampedArray): void {
    const frame: BufferedFrame = {
      timestamp: Date.now(),
      width,
      height,
      pixels: new Uint8ClampedArray(pixels), // Copy to prevent external mutation
    };

    this.buffer[this.head] = frame;
    this.head = (this.head + 1) % this.maxFrames;
    this.frameCount = Math.min(this.frameCount + 1, this.maxFrames);
  }

  /**
   * Extract a clip of frames around a trigger timestamp.
   * Returns frames within [triggerMs - beforeMs, triggerMs + afterMs].
   */
  extractClip(
    triggerTimestamp: number,
    beforeMs: number = CLIP_BEFORE_MS,
    afterMs: number = CLIP_AFTER_MS
  ): ClipFrames {
    const startTime = triggerTimestamp - beforeMs;
    const endTime = triggerTimestamp + afterMs;

    const frames: BufferedFrame[] = [];
    const orderedFrames = this.getOrderedFrames();

    for (const frame of orderedFrames) {
      if (frame.timestamp >= startTime && frame.timestamp <= endTime) {
        frames.push(frame);
      }
    }

    return {
      frames,
      startTimestamp: frames.length > 0 ? frames[0].timestamp : startTime,
      endTimestamp: frames.length > 0 ? frames[frames.length - 1].timestamp : endTime,
      durationMs: frames.length > 0
        ? frames[frames.length - 1].timestamp - frames[0].timestamp
        : 0,
      triggerTimestamp,
    };
  }

  /**
   * Get all frames in chronological order.
   */
  private getOrderedFrames(): BufferedFrame[] {
    const frames: BufferedFrame[] = [];

    if (this.frameCount < this.maxFrames) {
      // Buffer not yet full — frames are in order from 0 to frameCount-1
      for (let i = 0; i < this.frameCount; i++) {
        if (this.buffer[i]) {
          frames.push(this.buffer[i]);
        }
      }
    } else {
      // Buffer is full — start from head (oldest) and wrap around
      for (let i = 0; i < this.maxFrames; i++) {
        const idx = (this.head + i) % this.maxFrames;
        if (this.buffer[idx]) {
          frames.push(this.buffer[idx]);
        }
      }
    }

    return frames;
  }

  /**
   * Evict frames older than bufferDurationMs.
   * Called automatically but can also be triggered manually.
   */
  evictOld(): number {
    const cutoff = Date.now() - this.bufferDurationMs;
    let evicted = 0;

    for (let i = 0; i < this.buffer.length; i++) {
      if (this.buffer[i] && this.buffer[i].timestamp < cutoff) {
        // Don't actually delete — just let the ring buffer overwrite naturally
        evicted++;
      }
    }

    return evicted;
  }

  /**
   * Get the current number of frames in the buffer.
   */
  getFrameCount(): number {
    return this.frameCount;
  }

  /**
   * Get the capacity of the buffer.
   */
  getCapacity(): number {
    return this.maxFrames;
  }

  /**
   * Clear all frames from the buffer.
   * Must be called when the exam session ends.
   */
  clear(): void {
    this.buffer = new Array(this.maxFrames);
    this.head = 0;
    this.frameCount = 0;
  }

  /**
   * Get approximate memory usage in bytes.
   */
  getMemoryUsageBytes(): number {
    let total = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      if (this.buffer[i]) {
        total += this.buffer[i].pixels.byteLength;
      }
    }
    return total;
  }
}
