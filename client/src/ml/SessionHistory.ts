/**
 * SessionHistory — Read-only view over session telemetry for FL training
 *
 * Wraps the session store to extract training-ready telemetry windows.
 * Separates the read concern (training) from the write concern (exam).
 */

import { FEATURE_DIM, SEQ_LENGTH } from "./ModelManager";

export interface TelemetryFrame {
  timestamp: number;
  /** Pose/gaze features (3 values: yaw, pitch, roll) */
  poseGaze: number[];
  /** rPPG features (1 value: heart rate estimate) */
  rppg: number[];
  /** Action Unit features (10 values) */
  actionUnits: number[];
  /** Keystroke features (4 values: dwell, flight, wpm, correction_rate) */
  keystroke: number[];
  /** Audio features (2 values: energy, spectral_centroid) */
  audio: number[];
}

export interface TrainingSample {
  /** Telemetry window: SEQ_LENGTH × FEATURE_DIM as a flat Float32Array */
  features: Float32Array;
  /** Label: 0 = normal, 1 = anomaly (from tier classification) */
  label: number;
}

/**
 * SessionHistory provides a read-only view over accumulated telemetry
 * for the post-exam federated training phase.
 */
export class SessionHistory {
  private frames: TelemetryFrame[] = [];
  private tierLabels: Map<number, number> = new Map(); // timestamp -> tier (0 or 1)

  /** Record a telemetry frame during the exam. */
  pushFrame(frame: TelemetryFrame): void {
    this.frames.push(frame);
  }

  /** Record a tier classification result for a timestamp range. */
  markAnomaly(startTime: number, endTime: number): void {
    for (const frame of this.frames) {
      if (frame.timestamp >= startTime && frame.timestamp <= endTime) {
        this.tierLabels.set(frame.timestamp, 1);
      }
    }
  }

  /** Get total number of recorded frames. */
  get frameCount(): number {
    return this.frames.length;
  }

  /**
   * Convert a TelemetryFrame into a flat feature vector of FEATURE_DIM.
   *
   * Layout:
   *   [0-2]   poseGaze (3)
   *   [3]     rppg (1)
   *   [4-13]  actionUnits (10)
   *   [14-17] keystroke (4)
   *   [18-19] audio (2)
   *   Total = 20 = FEATURE_DIM
   */
  private frameToVector(frame: TelemetryFrame): number[] {
    const vec: number[] = [];

    // Pad/truncate each sub-array to expected lengths
    const pg = (frame.poseGaze || []).slice(0, 3);
    while (pg.length < 3) pg.push(0);
    vec.push(...pg);

    const rp = (frame.rppg || []).slice(0, 1);
    while (rp.length < 1) rp.push(0);
    vec.push(...rp);

    const au = (frame.actionUnits || []).slice(0, 10);
    while (au.length < 10) au.push(0);
    vec.push(...au);

    const ks = (frame.keystroke || []).slice(0, 4);
    while (ks.length < 4) ks.push(0);
    vec.push(...ks);

    const ad = (frame.audio || []).slice(0, 2);
    while (ad.length < 2) ad.push(0);
    vec.push(...ad);

    return vec;
  }

  /**
   * Extract training samples from the session history.
   *
   * Slides a window of SEQ_LENGTH frames across the timeline,
   * stepping by `stride` frames. Each window gets the majority
   * label from its constituent frames.
   */
  extractSamples(stride = 50): TrainingSample[] {
    if (this.frames.length < SEQ_LENGTH) return [];

    const samples: TrainingSample[] = [];

    for (
      let start = 0;
      start <= this.frames.length - SEQ_LENGTH;
      start += stride
    ) {
      const window = this.frames.slice(start, start + SEQ_LENGTH);
      const features = new Float32Array(SEQ_LENGTH * FEATURE_DIM);

      let anomalyCount = 0;
      for (let i = 0; i < window.length; i++) {
        const vec = this.frameToVector(window[i]);
        features.set(vec, i * FEATURE_DIM);
        if (this.tierLabels.get(window[i].timestamp) === 1) {
          anomalyCount++;
        }
      }

      // Majority label
      const label = anomalyCount > SEQ_LENGTH / 2 ? 1 : 0;

      samples.push({ features, label });
    }

    return samples;
  }

  /** Clear all stored data. */
  clear(): void {
    this.frames = [];
    this.tierLabels.clear();
  }
}
