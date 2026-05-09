/**
 * PhoneDetectionWorker — Phone/Object Detection
 *
 * Detects phones and prohibited objects in camera frames using
 * TensorFlow.js COCO-SSD object detection model at configurable
 * intervals (default: every 10 seconds).
 *
 * When TensorFlow.js is unavailable, falls back to a simple
 * rectangular-edge-density heuristic that detects phone-shaped
 * high-contrast rectangular regions.
 *
 * Privacy: No images stored or transmitted. Only detection
 * results (class labels + bounding box coordinates) are emitted.
 * Raw pixel data is discarded after inference.
 */

/* ── Types ────────────────────────────────────────────────── */

export interface DetectionResult {
  label: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
}

export interface PhoneCheckResult {
  detected: boolean;
  detections: DetectionResult[];
  method: "coco_ssd" | "edge_heuristic";
  checkedAt: string;
}

export type PhoneDetectionCallback = (result: PhoneCheckResult) => void;

/* ── Configuration ────────────────────────────────────────── */

const DEFAULT_INTERVAL_MS = 10_000;        // 10 seconds
const DEFAULT_CONFIDENCE_THRESHOLD = 0.5;  // Min confidence for COCO-SSD
const PROHIBITED_LABELS = new Set([
  "cell phone",
  "remote",   // Often misclassified as phone
  "book",     // Could be reference material
  "laptop",   // Second device
]);

// Heuristic fallback config
const EDGE_DENSITY_THRESHOLD = 0.3;
const MIN_RECT_ASPECT_RATIO = 1.5;  // Phone-like aspect ratio
const MAX_RECT_ASPECT_RATIO = 3.0;
const MIN_RECT_SIZE = 0.02;         // Minimum normalized area
const MAX_RECT_SIZE = 0.15;         // Maximum normalized area

/* ── Edge-based heuristic fallback ────────────────────────── */

/**
 * Simple phone-shaped object detection using edge density.
 * Scans for rectangular regions with high edge density and phone-like aspect ratio.
 *
 * Pure function for testability.
 */
export function detectPhoneHeuristic(
  pixels: Uint8ClampedArray,
  width: number,
  height: number
): DetectionResult[] {
  if (width === 0 || height === 0 || pixels.length === 0) {
    return [];
  }

  // Compute simple edge map using horizontal gradient
  const gridCols = 16;
  const gridRows = 12;
  const cellW = Math.floor(width / gridCols);
  const cellH = Math.floor(height / gridRows);
  const edgeGrid: number[][] = [];

  for (let gy = 0; gy < gridRows; gy++) {
    edgeGrid[gy] = [];
    for (let gx = 0; gx < gridCols; gx++) {
      let edgeSum = 0;
      let count = 0;
      const x0 = gx * cellW;
      const y0 = gy * cellH;

      for (let dy = 0; dy < cellH; dy += 2) {
        for (let dx = 0; dx < cellW - 1; dx += 2) {
          const x = x0 + dx;
          const y = y0 + dy;
          if (x >= width - 1 || y >= height) continue;

          const i1 = (y * width + x) * 4;
          const i2 = (y * width + x + 1) * 4;
          const gray1 = (pixels[i1] + pixels[i1 + 1] + pixels[i1 + 2]) / 3;
          const gray2 = (pixels[i2] + pixels[i2 + 1] + pixels[i2 + 2]) / 3;
          edgeSum += Math.abs(gray1 - gray2);
          count++;
        }
      }

      edgeGrid[gy][gx] = count > 0 ? edgeSum / count / 255 : 0;
    }
  }

  // Scan for rectangular clusters of high-edge cells
  const detections: DetectionResult[] = [];

  for (let gy = 0; gy < gridRows - 1; gy++) {
    for (let gx = 0; gx < gridCols - 1; gx++) {
      // Try different rectangle sizes
      for (let rh = 2; rh <= Math.min(6, gridRows - gy); rh++) {
        for (let rw = 1; rw <= Math.min(4, gridCols - gx); rw++) {
          const aspect = Math.max(rh, rw) / Math.max(1, Math.min(rh, rw));
          if (aspect < MIN_RECT_ASPECT_RATIO || aspect > MAX_RECT_ASPECT_RATIO) {
            continue;
          }

          const area = (rw * cellW * rh * cellH) / (width * height);
          if (area < MIN_RECT_SIZE || area > MAX_RECT_SIZE) {
            continue;
          }

          // Check edge density in the rectangle
          let totalEdge = 0;
          let cellCount = 0;
          for (let dy = 0; dy < rh; dy++) {
            for (let dx = 0; dx < rw; dx++) {
              totalEdge += edgeGrid[gy + dy][gx + dx];
              cellCount++;
            }
          }
          const avgEdge = cellCount > 0 ? totalEdge / cellCount : 0;

          if (avgEdge > EDGE_DENSITY_THRESHOLD) {
            detections.push({
              label: "cell phone",
              confidence: Math.min(0.6, avgEdge), // Heuristic confidence capped
              bbox: {
                x: (gx * cellW) / width,
                y: (gy * cellH) / height,
                width: (rw * cellW) / width,
                height: (rh * cellH) / height,
              },
            });
            // Only report the first detection per scan
            return detections;
          }
        }
      }
    }
  }

  return detections;
}

/* ── PhoneDetector class ──────────────────────────────────── */

export class PhoneDetector {
  private lastCheckTime = 0;
  private checkIntervalMs: number;
  private confidenceThreshold: number;
  private callback: PhoneDetectionCallback | null = null;
  private cocoSsdModel: CocoSsdLike | null = null;
  private cocoSsdFailed = false;
  private modelLoading = false;

  constructor(options?: {
    checkIntervalMs?: number;
    confidenceThreshold?: number;
    onDetection?: PhoneDetectionCallback;
    heuristicOnly?: boolean;
  }) {
    this.checkIntervalMs = options?.checkIntervalMs ?? DEFAULT_INTERVAL_MS;
    this.confidenceThreshold = options?.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
    this.callback = options?.onDetection ?? null;
    if (options?.heuristicOnly) {
      this.cocoSsdFailed = true; // Skip COCO-SSD loading
    }
  }

  /**
   * Check a frame for prohibited objects.
   * Returns null if interval hasn't elapsed yet.
   */
  async checkFrame(
    width: number,
    height: number,
    pixels: Uint8ClampedArray
  ): Promise<PhoneCheckResult | null> {
    const now = Date.now();
    if (now - this.lastCheckTime < this.checkIntervalMs) {
      return null;
    }
    this.lastCheckTime = now;

    // Try COCO-SSD first
    if (!this.cocoSsdFailed && !this.cocoSsdModel && !this.modelLoading) {
      await this.loadCocoSsd();
    }

    if (this.cocoSsdModel) {
      return this.checkWithCocoSsd(width, height, pixels);
    }

    // Fallback to heuristic
    return this.checkWithHeuristic(width, height, pixels);
  }

  private async loadCocoSsd(): Promise<void> {
    this.modelLoading = true;
    try {
      // Dynamic import — TensorFlow.js COCO-SSD
      const cocoSsd = await import("@tensorflow-models/coco-ssd");
      this.cocoSsdModel = await cocoSsd.load({ base: "lite_mobilenet_v2" });
    } catch {
      this.cocoSsdFailed = true;
    } finally {
      this.modelLoading = false;
    }
  }

  private async checkWithCocoSsd(
    width: number,
    height: number,
    pixels: Uint8ClampedArray
  ): Promise<PhoneCheckResult> {
    try {
      const imageData = { data: pixels, width, height };
      const predictions = await this.cocoSsdModel!.detect(imageData);

      const detections: DetectionResult[] = predictions
        .filter(
          (p: { class: string; score: number }) =>
            PROHIBITED_LABELS.has(p.class) && p.score >= this.confidenceThreshold
        )
        .map((p: { class: string; score: number; bbox: number[] }) => ({
          label: p.class,
          confidence: p.score,
          bbox: {
            x: p.bbox[0] / width,
            y: p.bbox[1] / height,
            width: p.bbox[2] / width,
            height: p.bbox[3] / height,
          },
        }));

      const result: PhoneCheckResult = {
        detected: detections.length > 0,
        detections,
        method: "coco_ssd",
        checkedAt: new Date().toISOString(),
      };

      if (result.detected) {
        this.callback?.(result);
      }

      return result;
    } catch {
      this.cocoSsdFailed = true;
      return this.checkWithHeuristic(width, height, pixels);
    }
  }

  private checkWithHeuristic(
    width: number,
    height: number,
    pixels: Uint8ClampedArray
  ): PhoneCheckResult {
    const detections = detectPhoneHeuristic(pixels, width, height);

    const result: PhoneCheckResult = {
      detected: detections.length > 0,
      detections,
      method: "edge_heuristic",
      checkedAt: new Date().toISOString(),
    };

    if (result.detected) {
      this.callback?.(result);
    }

    return result;
  }

  /**
   * Set the confidence threshold at runtime.
   */
  setConfidenceThreshold(threshold: number): void {
    this.confidenceThreshold = Math.max(0, Math.min(1, threshold));
  }
}

/* ── Internal type for COCO-SSD model ─────────────────────── */

interface CocoSsdLike {
  detect(input: unknown): Promise<
    Array<{ class: string; score: number; bbox: number[] }>
  >;
}
