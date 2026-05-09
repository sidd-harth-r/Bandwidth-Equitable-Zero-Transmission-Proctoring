/**
 * AuWorker — Facial Action Unit Worker
 *
 * Detects AU4, AU12, AU17, AU20, AU23, AU25, AU26 from Face Mesh landmark
 * distances or frame-pixel fallback.
 *
 * Privacy: Only derived AU activations and composite scores are emitted.
 */

import type { AuActivation, AuScoreMessage, AuWorkerInput } from "../coordinator/types";
import {
  computeAuFromFrame,
  computeAuAnomalyScore,
  averageActivations,
} from "./au-utils";

/* ── Worker scope ─────────────────────────────────────────── */

const workerScope = self as unknown as {
  onmessage: (event: MessageEvent<AuWorkerInput>) => void;
  postMessage: (message: AuScoreMessage) => void;
};

/* ── Configuration ────────────────────────────────────────── */

const CALIBRATION_FRAME_TARGET = 30;

/* ── State ────────────────────────────────────────────────── */

let running = false;
let calibrating = false;
let calibrationFrames: AuActivation[] = [];
let baseline: AuActivation | null = null;

/* ── Frame processing ─────────────────────────────────────── */

function processFrame(
  width: number,
  height: number,
  pixels: Uint8ClampedArray
): void {
  const startTime = performance.now();
  const activations = computeAuFromFrame(width, height, pixels);

  const done = (score: number, reason: string, isCalibrating: boolean) => {
    const processingTimeMs = performance.now() - startTime;
    workerScope.postMessage({
      type: "au_score",
      score,
      reason,
      sampledAt: new Date().toISOString(),
      processingTimeMs,
      activations,
      isCalibrating,
    });
  };

  if (calibrating) {
    calibrationFrames.push(activations);

    if (calibrationFrames.length >= CALIBRATION_FRAME_TARGET) {
      baseline = averageActivations(calibrationFrames);
      calibrating = false;
      calibrationFrames = [];

      done(0, "calibration_complete", false);
      return;
    }

    const progress = Math.round(
      (calibrationFrames.length / CALIBRATION_FRAME_TARGET) * 100
    );
    done(0, `calibrating_${progress}pct`, true);
    return;
  }

  if (!baseline) {
    done(0, "no_baseline", false);
    return;
  }

  const score = computeAuAnomalyScore(activations, baseline);
  done(score, "au_active", false);
}

/* ── Worker message handler ───────────────────────────────── */

let targetFps = 10;
let channelActive = true;
let lastFrameTime = 0;

workerScope.onmessage = (event: MessageEvent<AuWorkerInput>) => {
  const msg = event.data;

  if (msg.type === "GEAR_CONFIG") {
    targetFps = msg.targetFps;
    channelActive = msg.activeChannels["au"] !== false;
    return;
  }

  if (msg.type === "start") {
    running = true;
    calibrating = true;
    calibrationFrames = [];
    baseline = null;
  }

  if (msg.type === "stop") {
    running = false;
    calibrating = false;
  }

  if (msg.type === "frame" && running) {
    if (!channelActive) return;
    const now = Date.now();
    if (now - lastFrameTime < 1000 / targetFps) return;
    lastFrameTime = now;
    processFrame(msg.width, msg.height, msg.pixels);
  }

  if (msg.type === "set_baseline") {
    baseline = msg.baseline;
    calibrating = false;
  }
};

export {};
