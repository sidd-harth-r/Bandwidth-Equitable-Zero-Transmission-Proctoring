/**
 * RppgWorker — Remote Photoplethysmography Worker
 *
 * Extracts green-channel intensity from facial skin regions in video frames,
 * applies a FIR bandpass filter (0.75–4 Hz), and estimates heart-rate variability
 * to produce an rPPG anomaly score.
 *
 * Privacy: Only derived scalar scores are emitted — no raw pixel data leaves this worker.
 */

import type { RppgScoreMessage, RppgWorkerInput } from "../coordinator/types";
import {
  generateBandpassCoefficients,
  applyFirFilter,
  extractGreenChannelMean,
  estimateHeartRate,
  computeSignalVariance,
  computeSignalQuality,
  computeRppgScore,
} from "./rppg-utils";

/* ── Worker scope ─────────────────────────────────────────── */

const workerScope = self as unknown as {
  onmessage: (event: MessageEvent<RppgWorkerInput>) => void;
  postMessage: (message: RppgScoreMessage) => void;
};

/* ── Configuration ────────────────────────────────────────── */

const SAMPLE_RATE = 10;
const FILTER_LOW_HZ = 0.75;
const FILTER_HIGH_HZ = 4.0;
const CALIBRATION_DURATION_MS = 120_000;
const BUFFER_SIZE = 256;
const FIR_ORDER = 32;

const FIR_COEFFICIENTS = generateBandpassCoefficients(
  FILTER_LOW_HZ,
  FILTER_HIGH_HZ,
  SAMPLE_RATE,
  FIR_ORDER
);

/* ── State ────────────────────────────────────────────────── */

let running = false;
let calibrating = false;
let calibrationStartTime: number | null = null;
let baselineHr: number | null = null;
let baselineVariance: number | null = null;

const greenBuffer: number[] = [];
const filteredBuffer: number[] = [];

/* ── Frame processing ─────────────────────────────────────── */

function processFrame(
  width: number,
  height: number,
  pixels: Uint8ClampedArray
): void {
  const greenMean = extractGreenChannelMean(width, height, pixels);

  greenBuffer.push(greenMean);
  if (greenBuffer.length > BUFFER_SIZE) {
    greenBuffer.shift();
  }

  const filteredValue = applyFirFilter(greenBuffer, FIR_COEFFICIENTS);
  filteredBuffer.push(filteredValue);
  if (filteredBuffer.length > BUFFER_SIZE) {
    filteredBuffer.shift();
  }

  const heartRate = estimateHeartRate(filteredBuffer, SAMPLE_RATE);
  const variance = computeSignalVariance(filteredBuffer, SAMPLE_RATE);
  const quality = computeSignalQuality(filteredBuffer, SAMPLE_RATE);

  if (calibrating) {
    const elapsed = calibrationStartTime ? Date.now() - calibrationStartTime : 0;

    if (elapsed >= CALIBRATION_DURATION_MS && heartRate !== null) {
      baselineHr = heartRate;
      baselineVariance = variance;
      calibrating = false;

      workerScope.postMessage({
        type: "rppg_score",
        score: 0,
        reason: "calibration_complete",
        sampledAt: new Date().toISOString(),
        heartRateEstimate: heartRate,
        signalQuality: quality,
        isCalibrating: false,
      });
      return;
    }

    workerScope.postMessage({
      type: "rppg_score",
      score: 0,
      reason: `calibrating_${Math.round((elapsed / CALIBRATION_DURATION_MS) * 100)}pct`,
      sampledAt: new Date().toISOString(),
      heartRateEstimate: heartRate,
      signalQuality: quality,
      isCalibrating: true,
    });
    return;
  }

  if (baselineHr === null || baselineVariance === null) {
    workerScope.postMessage({
      type: "rppg_score",
      score: 0,
      reason: "no_baseline",
      sampledAt: new Date().toISOString(),
      heartRateEstimate: heartRate,
      signalQuality: quality,
      isCalibrating: false,
    });
    return;
  }

  const score = computeRppgScore(heartRate, variance, baselineHr, baselineVariance);

  workerScope.postMessage({
    type: "rppg_score",
    score,
    reason: quality > 0.3 ? "rppg_active" : "rppg_low_quality",
    sampledAt: new Date().toISOString(),
    heartRateEstimate: heartRate,
    signalQuality: quality,
    isCalibrating: false,
  });
}

/* ── Worker message handler ───────────────────────────────── */

workerScope.onmessage = (event: MessageEvent<RppgWorkerInput>) => {
  const msg = event.data;

  if (msg.type === "start") {
    running = true;
    calibrating = true;
    calibrationStartTime = Date.now();
    greenBuffer.length = 0;
    filteredBuffer.length = 0;
    baselineHr = null;
    baselineVariance = null;
  }

  if (msg.type === "stop") {
    running = false;
    calibrating = false;
  }

  if (msg.type === "frame" && running) {
    processFrame(msg.width, msg.height, msg.pixels);
  }

  if (msg.type === "set_baseline") {
    baselineHr = msg.baselineHr;
    baselineVariance = msg.baselineVariance;
    calibrating = false;
  }
};

export {};
