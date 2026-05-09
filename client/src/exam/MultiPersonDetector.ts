/**
 * MultiPersonDetector — Multi-Person Skeleton Rule
 *
 * Detects multiple people in frame using a pixel-based skin-region
 * clustering heuristic. When MediaPipe Pose is available, this module
 * can also check for multiple face/body landmarks if multi-person
 * detection is supported.
 *
 * Current approach: Detect distinct skin-colored regions that are
 * spatially separated. Two or more separated skin clusters → flag.
 *
 * Privacy: No images stored. Only a boolean flag and cluster count.
 */

/* ── Types ────────────────────────────────────────────────── */

export interface MultiPersonResult {
  detectedCount: number;
  isMultiplePeople: boolean;
  regions: Array<{ centerX: number; centerY: number; pixelCount: number }>;
  checkedAt: string;
}

export type MultiPersonCallback = (result: MultiPersonResult) => void;

/* ── Configuration ────────────────────────────────────────── */

const CHECK_INTERVAL_MS = 5_000; // Check every 5 seconds
const MIN_REGION_PIXELS = 20;    // Minimum pixels for a valid skin region (pre-sampling)
const MERGE_DISTANCE = 0.15;     // Normalized distance to merge clusters
const SAMPLE_STEP = 4;           // Sample every 4th pixel

/* ── Skin detection ───────────────────────────────────────── */

/**
 * Simple skin-color detection in RGB space.
 * Returns true if the pixel is likely skin-colored.
 */
function isSkinPixel(r: number, g: number, b: number): boolean {
  // Rule-based skin detection (Peer et al.)
  return (
    r > 95 && g > 40 && b > 20 &&
    r > g && r > b &&
    (r - g) > 15 &&
    Math.abs(r - g) > 15 &&
    r - Math.min(g, b) > 15
  );
}

/**
 * Detect distinct skin-colored regions in a frame.
 * Uses a grid-based clustering approach.
 *
 * Pure function for testability.
 */
export function detectSkinRegions(
  pixels: Uint8ClampedArray,
  width: number,
  height: number
): Array<{ centerX: number; centerY: number; pixelCount: number }> {
  // Collect skin pixel positions
  const skinPoints: Array<{ x: number; y: number }> = [];

  for (let y = 0; y < height; y += SAMPLE_STEP) {
    for (let x = 0; x < width; x += SAMPLE_STEP) {
      const i = (y * width + x) * 4;
      if (isSkinPixel(pixels[i], pixels[i + 1], pixels[i + 2])) {
        skinPoints.push({ x: x / width, y: y / height });
      }
    }
  }

  if (skinPoints.length === 0) {
    return [];
  }

  // Simple greedy clustering
  const clusters: Array<{ sumX: number; sumY: number; count: number }> = [];

  for (const pt of skinPoints) {
    let merged = false;
    for (const cluster of clusters) {
      const cx = cluster.sumX / cluster.count;
      const cy = cluster.sumY / cluster.count;
      const dist = Math.hypot(pt.x - cx, pt.y - cy);
      if (dist < MERGE_DISTANCE) {
        cluster.sumX += pt.x;
        cluster.sumY += pt.y;
        cluster.count++;
        merged = true;
        break;
      }
    }
    if (!merged) {
      clusters.push({ sumX: pt.x, sumY: pt.y, count: 1 });
    }
  }

  // Filter out small clusters and convert to results
  return clusters
    .filter((c) => c.count >= MIN_REGION_PIXELS / (SAMPLE_STEP * SAMPLE_STEP))
    .map((c) => ({
      centerX: c.sumX / c.count,
      centerY: c.sumY / c.count,
      pixelCount: c.count * SAMPLE_STEP * SAMPLE_STEP, // Approximate
    }));
}

/* ── MultiPersonDetector class ────────────────────────────── */

export class MultiPersonDetector {
  private lastCheckTime = 0;
  private checkIntervalMs: number;
  private callback: MultiPersonCallback | null = null;

  constructor(options?: {
    checkIntervalMs?: number;
    onDetection?: MultiPersonCallback;
  }) {
    this.checkIntervalMs = options?.checkIntervalMs ?? CHECK_INTERVAL_MS;
    this.callback = options?.onDetection ?? null;
  }

  /**
   * Check a frame for multiple people.
   * Only runs if enough time has elapsed since the last check.
   */
  checkFrame(
    width: number,
    height: number,
    pixels: Uint8ClampedArray
  ): MultiPersonResult | null {
    const now = Date.now();
    if (now - this.lastCheckTime < this.checkIntervalMs) {
      return null;
    }
    this.lastCheckTime = now;

    const regions = detectSkinRegions(pixels, width, height);

    const result: MultiPersonResult = {
      detectedCount: regions.length,
      isMultiplePeople: regions.length >= 2,
      regions,
      checkedAt: new Date().toISOString(),
    };

    if (result.isMultiplePeople) {
      this.callback?.(result);
    }

    return result;
  }

  /**
   * Force a check regardless of interval.
   */
  forceCheck(
    width: number,
    height: number,
    pixels: Uint8ClampedArray
  ): MultiPersonResult {
    this.lastCheckTime = 0;
    return this.checkFrame(width, height, pixels)!;
  }
}
