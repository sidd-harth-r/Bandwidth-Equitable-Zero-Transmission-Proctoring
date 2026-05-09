/**
 * BackgroundMonitor — Background Change Detection
 *
 * Captures a reference frame of the background and periodically
 * compares new frames against it. Large changes trigger Tier 1
 * (e.g., person swap, environment change).
 *
 * Privacy: Reference frame is stored in memory only, never
 * persisted to disk or transmitted. Only a scalar change score
 * and boolean flag are emitted.
 */

/* ── Types ────────────────────────────────────────────────── */

export interface BackgroundCheckResult {
  changeScore: number;       // 0–1, fraction of pixels that changed significantly
  threshold: number;         // Current threshold
  exceeded: boolean;         // True if changeScore > threshold
  checkedAt: string;
  framesSinceReference: number;
}

export type BackgroundMonitorCallback = (result: BackgroundCheckResult) => void;

/* ── Configuration ────────────────────────────────────────── */

const DEFAULT_CHECK_INTERVAL_MS = 30_000; // 30 seconds
const DEFAULT_CHANGE_THRESHOLD = 0.25;    // 25% pixel change triggers alert
const PIXEL_DIFF_THRESHOLD = 40;          // Per-channel difference to count as "changed"
const SAMPLE_STEP = 4;                    // Sample every 4th pixel for performance

/* ── Utilities ────────────────────────────────────────────── */

/**
 * Compare two frames and return the fraction of pixels that differ
 * significantly. Pure function for testability.
 */
export function computeFrameDifference(
  reference: Uint8ClampedArray,
  current: Uint8ClampedArray,
  width: number,
  height: number
): number {
  if (reference.length !== current.length) {
    return 0;
  }

  let changedPixels = 0;
  let sampledPixels = 0;

  for (let y = 0; y < height; y += SAMPLE_STEP) {
    for (let x = 0; x < width; x += SAMPLE_STEP) {
      const i = (y * width + x) * 4;
      const dr = Math.abs(reference[i] - current[i]);
      const dg = Math.abs(reference[i + 1] - current[i + 1]);
      const db = Math.abs(reference[i + 2] - current[i + 2]);
      const maxDiff = Math.max(dr, dg, db);

      if (maxDiff > PIXEL_DIFF_THRESHOLD) {
        changedPixels++;
      }
      sampledPixels++;
    }
  }

  return sampledPixels > 0 ? changedPixels / sampledPixels : 0;
}

/* ── BackgroundMonitor class ──────────────────────────────── */

export class BackgroundMonitor {
  private referenceFrame: Uint8ClampedArray | null = null;
  private referenceWidth = 0;
  private referenceHeight = 0;
  private framesSinceReference = 0;
  private threshold: number;
  private checkIntervalMs: number;
  private lastCheckTime = 0;
  private callback: BackgroundMonitorCallback | null = null;

  constructor(options?: {
    threshold?: number;
    checkIntervalMs?: number;
    onAlert?: BackgroundMonitorCallback;
  }) {
    this.threshold = options?.threshold ?? DEFAULT_CHANGE_THRESHOLD;
    this.checkIntervalMs = options?.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS;
    this.callback = options?.onAlert ?? null;
  }

  /**
   * Set the reference frame for comparison.
   * This is called after room scan to capture the baseline environment.
   */
  setReferenceFrame(width: number, height: number, pixels: Uint8ClampedArray): void {
    this.referenceFrame = new Uint8ClampedArray(pixels);
    this.referenceWidth = width;
    this.referenceHeight = height;
    this.framesSinceReference = 0;
    this.lastCheckTime = Date.now();
  }

  /**
   * Check a new frame against the reference.
   * Only performs the check if enough time has elapsed since the last check.
   * Returns the result, or null if skipped (interval not reached or no reference).
   */
  checkFrame(width: number, height: number, pixels: Uint8ClampedArray): BackgroundCheckResult | null {
    this.framesSinceReference++;

    if (!this.referenceFrame) {
      return null;
    }

    const now = Date.now();
    if (now - this.lastCheckTime < this.checkIntervalMs) {
      return null;
    }
    this.lastCheckTime = now;

    if (width !== this.referenceWidth || height !== this.referenceHeight) {
      return null;
    }

    const changeScore = computeFrameDifference(
      this.referenceFrame,
      pixels,
      width,
      height
    );

    const result: BackgroundCheckResult = {
      changeScore,
      threshold: this.threshold,
      exceeded: changeScore > this.threshold,
      checkedAt: new Date().toISOString(),
      framesSinceReference: this.framesSinceReference,
    };

    if (result.exceeded) {
      this.callback?.(result);
    }

    return result;
  }

  /**
   * Update the change threshold at runtime.
   */
  setThreshold(threshold: number): void {
    this.threshold = Math.max(0, Math.min(1, threshold));
  }

  /**
   * Check if a reference frame has been set.
   */
  hasReference(): boolean {
    return this.referenceFrame !== null;
  }

  /**
   * Clear the reference frame and reset state.
   */
  reset(): void {
    this.referenceFrame = null;
    this.referenceWidth = 0;
    this.referenceHeight = 0;
    this.framesSinceReference = 0;
  }
}
