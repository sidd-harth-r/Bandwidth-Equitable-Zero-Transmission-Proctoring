/**
 * KeystrokeWorker — Keystroke Dynamics Worker
 *
 * Captures typing biometrics: dwell time, flight time, variance,
 * backspace rate, and paste ratio.
 *
 * Privacy: Key identities are discarded after timing extraction.
 * Only aggregate timing features and anomaly scores are emitted.
 */

import type {
  KeystrokeFeatures,
  KeystrokeScoreMessage,
  KeystrokeWorkerInput,
} from "../coordinator/types";
import { mean, variance, computeKeystrokeScore } from "./keystroke-utils";

/* ── Worker scope ─────────────────────────────────────────── */

const workerScope = self as unknown as {
  onmessage: (event: MessageEvent<KeystrokeWorkerInput>) => void;
  postMessage: (message: KeystrokeScoreMessage) => void;
};

/* ── Configuration ────────────────────────────────────────── */

const MAX_EVENTS = 500;
const MIN_EVENTS_FOR_SCORE = 10;
const CALIBRATION_EVENT_TARGET = 200;
const EMIT_INTERVAL_MS = 3000;

/* ── State ────────────────────────────────────────────────── */

let running = false;
let calibrating = false;
let baseline: KeystrokeFeatures | null = null;
let emitIntervalId: ReturnType<typeof setInterval> | undefined;

const activeKeys = new Map<string, number>();
const dwellTimes: number[] = [];
const flightTimes: number[] = [];

let lastKeydownTime: number | null = null;
let totalKeystrokes = 0;
let backspaceCount = 0;
let pasteCount = 0;
let pasteCharCount = 0;
let totalCharCount = 0;
let calibrationKeystrokes = 0;

/* ── Feature extraction ───────────────────────────────────── */

function extractFeatures(): KeystrokeFeatures {
  return {
    dwellMean: mean(dwellTimes),
    dwellVariance: variance(dwellTimes),
    flightMean: mean(flightTimes),
    flightVariance: variance(flightTimes),
    backspaceRate: totalKeystrokes > 0 ? backspaceCount / totalKeystrokes : 0,
    pasteRatio: totalCharCount > 0 ? pasteCharCount / totalCharCount : 0,
  };
}

/* ── Event handlers ───────────────────────────────────────── */

function handleKeydown(key: string, timestamp: number): void {
  totalKeystrokes++;
  totalCharCount++;

  if (key === "Backspace" || key === "Delete") {
    backspaceCount++;
  }

  if (lastKeydownTime !== null) {
    const flight = timestamp - lastKeydownTime;
    if (flight > 0 && flight < 5000) {
      flightTimes.push(flight);
      if (flightTimes.length > MAX_EVENTS) {
        flightTimes.shift();
      }
    }
  }
  lastKeydownTime = timestamp;
  activeKeys.set(key, timestamp);

  if (calibrating) {
    calibrationKeystrokes++;
  }
}

function handleKeyup(key: string, timestamp: number): void {
  const downTime = activeKeys.get(key);
  if (downTime !== undefined) {
    const dwell = timestamp - downTime;
    if (dwell > 0 && dwell < 3000) {
      dwellTimes.push(dwell);
      if (dwellTimes.length > MAX_EVENTS) {
        dwellTimes.shift();
      }
    }
    activeKeys.delete(key);
  }
}

function handlePaste(_timestamp: number, length: number): void {
  pasteCount++;
  pasteCharCount += length;
  totalCharCount += length;
}

/* ── Periodic emission ────────────────────────────────────── */

function emitScore(): void {
  if (!running) return;

  const features = extractFeatures();

  if (calibrating) {
    if (calibrationKeystrokes >= CALIBRATION_EVENT_TARGET) {
      baseline = features;
      calibrating = false;

      workerScope.postMessage({
        type: "keystroke_score",
        score: 0,
        reason: "calibration_complete",
        sampledAt: new Date().toISOString(),
        features,
        isCalibrating: false,
      });
      return;
    }

    const progress = Math.round(
      (calibrationKeystrokes / CALIBRATION_EVENT_TARGET) * 100
    );
    workerScope.postMessage({
      type: "keystroke_score",
      score: 0,
      reason: `calibrating_${progress}pct`,
      sampledAt: new Date().toISOString(),
      features,
      isCalibrating: true,
    });
    return;
  }

  if (!baseline) {
    workerScope.postMessage({
      type: "keystroke_score",
      score: 0,
      reason: "no_baseline",
      sampledAt: new Date().toISOString(),
      features,
      isCalibrating: false,
    });
    return;
  }

  if (dwellTimes.length < MIN_EVENTS_FOR_SCORE) {
    workerScope.postMessage({
      type: "keystroke_score",
      score: 0,
      reason: "insufficient_data",
      sampledAt: new Date().toISOString(),
      features,
      isCalibrating: false,
    });
    return;
  }

  const score = computeKeystrokeScore(features, baseline);

  workerScope.postMessage({
    type: "keystroke_score",
    score,
    reason: "keystroke_active",
    sampledAt: new Date().toISOString(),
    features,
    isCalibrating: false,
  });
}

/* ── Worker message handler ───────────────────────────────── */

let channelActive = true;

workerScope.onmessage = (event: MessageEvent<KeystrokeWorkerInput>) => {
  const msg = event.data;

  if (msg.type === "GEAR_CONFIG") {
    channelActive = msg.activeChannels["keystroke"] !== false;
    return;
  }

  if (msg.type === "start") {
    running = true;
    calibrating = true;
    calibrationKeystrokes = 0;
    dwellTimes.length = 0;
    flightTimes.length = 0;
    activeKeys.clear();
    lastKeydownTime = null;
    totalKeystrokes = 0;
    backspaceCount = 0;
    pasteCount = 0;
    pasteCharCount = 0;
    totalCharCount = 0;
    baseline = null;

    if (emitIntervalId !== undefined) {
      clearInterval(emitIntervalId);
    }
    emitIntervalId = setInterval(emitScore, EMIT_INTERVAL_MS);
  }

  if (msg.type === "stop") {
    running = false;
    calibrating = false;
    if (emitIntervalId !== undefined) {
      clearInterval(emitIntervalId);
      emitIntervalId = undefined;
    }
  }

  if (msg.type === "keydown" && running && channelActive) {
    handleKeydown(msg.key, msg.timestamp);
  }

  if (msg.type === "keyup" && running && channelActive) {
    handleKeyup(msg.key, msg.timestamp);
  }

  if (msg.type === "paste" && running && channelActive) {
    handlePaste(msg.timestamp, msg.length);
  }

  if (msg.type === "set_baseline") {
    baseline = msg.baseline;
    calibrating = false;
  }

  if (msg.type === "flush") {
    emitScore();
  }
};

export {};
