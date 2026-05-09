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
  const activations = computeAuFromFrame(width, height, pixels);

  if (calibrating) {
    calibrationFrames.push(activations);

    if (calibrationFrames.length >= CALIBRATION_FRAME_TARGET) {
      baseline = averageActivations(calibrationFrames);
      calibrating = false;
      calibrationFrames = [];

      workerScope.postMessage({
        type: "au_score",
        score: 0,
        reason: "calibration_complete",
        sampledAt: new Date().toISOString(),
        activations,
        isCalibrating: false,
      });
      return;
    }

    const progress = Math.round(
      (calibrationFrames.length / CALIBRATION_FRAME_TARGET) * 100
    );
    workerScope.postMessage({
      type: "au_score",
      score: 0,
      reason: `calibrating_${progress}pct`,
      sampledAt: new Date().toISOString(),
      activations,
      isCalibrating: true,
    });
    return;
  }

  if (!baseline) {
    workerScope.postMessage({
      type: "au_score",
      score: 0,
      reason: "no_baseline",
      sampledAt: new Date().toISOString(),
      activations,
      isCalibrating: false,
    });
    return;
  }

  const score = computeAuAnomalyScore(activations, baseline);

  workerScope.postMessage({
    type: "au_score",
    score,
    reason: "au_active",
    sampledAt: new Date().toISOString(),
    activations,
    isCalibrating: false,
  });
}

/* ── Worker message handler ───────────────────────────────── */

workerScope.onmessage = (event: MessageEvent<AuWorkerInput>) => {
  const msg = event.data;

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
    processFrame(msg.width, msg.height, msg.pixels);
  }

  if (msg.type === "set_baseline") {
    baseline = msg.baseline;
    calibrating = false;
  }
};

export {};
