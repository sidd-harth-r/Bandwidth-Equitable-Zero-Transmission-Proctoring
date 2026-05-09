/**
 * RoomScanFlow — 360° Room Scan Workflow
 *
 * Guides the student through a room scan by tracking camera
 * rotation coverage using frame-to-frame optical flow estimation.
 * Captures a background reference frame at completion.
 *
 * Privacy: No images are stored or transmitted. Only cumulative
 * rotation metrics and a pass/fail result are emitted. The
 * background reference frame is held in RAM for BackgroundMonitor
 * but never persisted.
 */

/* ── Types ────────────────────────────────────────────────── */

export interface RoomScanProgress {
  coveredDegrees: number;
  targetDegrees: number;
  percentComplete: number;
  isComplete: boolean;
  direction: "clockwise" | "counterclockwise" | "unknown";
}

export interface RoomScanResult {
  passed: boolean;
  coveredDegrees: number;
  durationMs: number;
  referenceFrame: {
    width: number;
    height: number;
    pixels: Uint8ClampedArray;
  } | null;
}

export type RoomScanCallback = (
  event:
    | { type: "progress"; progress: RoomScanProgress }
    | { type: "complete"; result: RoomScanResult }
) => void;

/* ── Configuration ────────────────────────────────────────── */

const TARGET_ROTATION_DEGREES = 300; // Less than 360° to be realistic
const TIMEOUT_MS = 60_000;           // 60-second time limit
const MIN_MOTION_THRESHOLD = 0.02;   // Minimum frame-to-frame motion to count
const DEGREES_PER_MOTION_UNIT = 8;   // Heuristic: how many degrees per unit of motion

/* ── Motion estimation ────────────────────────────────────── */

/**
 * Estimate horizontal motion between two frames using column-brightness comparison.
 * Returns a signed value: positive = rightward motion, negative = leftward.
 * Pure function for testability.
 */
export function estimateHorizontalMotion(
  prev: Uint8ClampedArray,
  curr: Uint8ClampedArray,
  width: number,
  height: number
): number {
  if (prev.length !== curr.length || prev.length === 0) {
    return 0;
  }

  // Compute column brightness profiles
  const cols = 8; // Sample 8 columns
  const colWidth = Math.floor(width / cols);
  const prevProfile: number[] = [];
  const currProfile: number[] = [];

  for (let c = 0; c < cols; c++) {
    let prevSum = 0;
    let currSum = 0;
    let count = 0;
    const x0 = c * colWidth;
    const x1 = Math.min(x0 + colWidth, width);

    for (let y = 0; y < height; y += 4) {
      for (let x = x0; x < x1; x += 4) {
        const i = (y * width + x) * 4;
        prevSum += prev[i] + prev[i + 1] + prev[i + 2];
        currSum += curr[i] + curr[i + 1] + curr[i + 2];
        count++;
      }
    }

    prevProfile.push(count > 0 ? prevSum / count : 0);
    currProfile.push(count > 0 ? currSum / count : 0);
  }

  // Estimate shift via cross-correlation peak offset
  let bestShift = 0;
  let bestCorr = -Infinity;

  for (let shift = -3; shift <= 3; shift++) {
    let corr = 0;
    let count = 0;
    for (let i = 0; i < cols; i++) {
      const j = i + shift;
      if (j >= 0 && j < cols) {
        corr += prevProfile[i] * currProfile[j];
        count++;
      }
    }
    if (count > 0) {
      corr /= count;
      if (corr > bestCorr) {
        bestCorr = corr;
        bestShift = shift;
      }
    }
  }

  // Normalize shift to a motion value
  return bestShift / cols;
}

/* ── RoomScanFlow class ───────────────────────────────────── */

export class RoomScanFlow {
  private callback: RoomScanCallback;
  private running = false;
  private coveredDegrees = 0;
  private direction: "clockwise" | "counterclockwise" | "unknown" = "unknown";
  private prevFrame: Uint8ClampedArray | null = null;
  private prevWidth = 0;
  private prevHeight = 0;
  private startTime = 0;
  private timeoutId: ReturnType<typeof setTimeout> | undefined;
  private latestFrame: { width: number; height: number; pixels: Uint8ClampedArray } | null = null;
  private _resolve: ((result: RoomScanResult) => void) | null = null;

  constructor(callback: RoomScanCallback) {
    this.callback = callback;
  }

  /**
   * Start the room scan flow.
   * Returns a promise that resolves when complete or timed out.
   */
  async start(): Promise<RoomScanResult> {
    this.running = true;
    this.coveredDegrees = 0;
    this.direction = "unknown";
    this.prevFrame = null;
    this.startTime = Date.now();

    return new Promise<RoomScanResult>((resolve) => {
      this._resolve = resolve;

      this.timeoutId = setTimeout(() => {
        if (this.running) {
          this.complete(false);
        }
      }, TIMEOUT_MS);
    });
  }

  /**
   * Feed a video frame during the room scan.
   * Call this on every frame from the camera.
   */
  feedFrame(width: number, height: number, pixels: Uint8ClampedArray): void {
    if (!this.running) return;

    this.latestFrame = { width, height, pixels: new Uint8ClampedArray(pixels) };

    if (!this.prevFrame || this.prevWidth !== width || this.prevHeight !== height) {
      this.prevFrame = new Uint8ClampedArray(pixels);
      this.prevWidth = width;
      this.prevHeight = height;
      return;
    }

    const motion = estimateHorizontalMotion(this.prevFrame, pixels, width, height);

    if (Math.abs(motion) > MIN_MOTION_THRESHOLD) {
      const degrees = Math.abs(motion) * DEGREES_PER_MOTION_UNIT;
      this.coveredDegrees += degrees;

      if (this.direction === "unknown") {
        this.direction = motion > 0 ? "clockwise" : "counterclockwise";
      }
    }

    this.prevFrame = new Uint8ClampedArray(pixels);

    const progress: RoomScanProgress = {
      coveredDegrees: Math.round(this.coveredDegrees),
      targetDegrees: TARGET_ROTATION_DEGREES,
      percentComplete: Math.min(100, Math.round((this.coveredDegrees / TARGET_ROTATION_DEGREES) * 100)),
      isComplete: this.coveredDegrees >= TARGET_ROTATION_DEGREES,
      direction: this.direction,
    };

    this.callback({ type: "progress", progress });

    if (progress.isComplete) {
      this.complete(true);
    }
  }

  private complete(passed: boolean): void {
    if (!this.running) return;

    this.running = false;

    if (this.timeoutId !== undefined) {
      clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
    }

    const result: RoomScanResult = {
      passed,
      coveredDegrees: Math.round(this.coveredDegrees),
      durationMs: Date.now() - this.startTime,
      referenceFrame: this.latestFrame,
    };

    this.callback({ type: "complete", result });
    this._resolve?.(result);
    this._resolve = null;
  }

  /**
   * Cancel the room scan.
   */
  cancel(): void {
    this.complete(false);
  }

  isRunning(): boolean {
    return this.running;
  }
}
