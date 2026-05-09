/**
 * Keystroke Dynamics Utilities
 *
 * Pure functions for keystroke feature extraction and scoring.
 * Extracted from KeystrokeWorker for testability outside the Web Worker context.
 */

import type { KeystrokeFeatures } from "../coordinator/types";

/* ── Math utilities ───────────────────────────────────────── */

export function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function variance(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / arr.length;
}

/* ── Scoring ──────────────────────────────────────────────── */

/**
 * Compute keystroke anomaly score by comparing current features to baseline.
 */
export function computeKeystrokeScore(
  current: KeystrokeFeatures,
  base: KeystrokeFeatures
): number {
  let score = 0;

  // Dwell time deviation
  if (base.dwellMean > 0) {
    const dwellDev = Math.abs(current.dwellMean - base.dwellMean) / base.dwellMean;
    score += Math.min(1, dwellDev * 1.5) * 0.20;
  }

  // Dwell variance deviation
  if (base.dwellVariance > 0) {
    const varDev = Math.abs(current.dwellVariance - base.dwellVariance) / base.dwellVariance;
    score += Math.min(1, varDev * 1.2) * 0.10;
  }

  // Flight time deviation
  if (base.flightMean > 0) {
    const flightDev = Math.abs(current.flightMean - base.flightMean) / base.flightMean;
    score += Math.min(1, flightDev * 1.5) * 0.25;
  }

  // Flight variance deviation
  if (base.flightVariance > 0) {
    const fVarDev = Math.abs(current.flightVariance - base.flightVariance) / base.flightVariance;
    score += Math.min(1, fVarDev * 1.2) * 0.10;
  }

  // Backspace rate deviation
  const bsDev = Math.abs(current.backspaceRate - base.backspaceRate);
  score += Math.min(1, bsDev * 5) * 0.15;

  // Paste ratio — high paste ratio is suspicious
  score += Math.min(1, current.pasteRatio * 3) * 0.20;

  return Math.max(0, Math.min(1, score));
}
