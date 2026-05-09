/**
 * AU Signal Processing Utilities
 *
 * Pure functions for AU activation computation and scoring.
 * Extracted from AuWorker for testability outside the Web Worker context.
 */

import type { AuActivation } from "../coordinator/types";

/* ── Types ────────────────────────────────────────────────── */

interface Point2D {
  x: number;
  y: number;
}

/* ── Geometry helpers ─────────────────────────────────────── */

function distance(a: Point2D, b: Point2D): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/* ── Helpers ──────────────────────────────────────────────── */

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

/* ── Face Mesh landmark indices ───────────────────────────── */

const LANDMARKS = {
  leftBrowInner: 107,
  rightBrowInner: 336,
  leftEyeUpper: 159,
  rightEyeUpper: 386,
  lipLeft: 61,
  lipRight: 291,
  lipUpperCenter: 13,
  lipLowerCenter: 14,
  chinBottom: 152,
  lowerLipBottom: 17,
  lipLeftLower: 57,
  lipRightLower: 287,
  upperLipBottom: 13,
  lowerLipTop: 14,
  noseBase: 2,
  jawTip: 152,
  leftEyeInner: 133,
  rightEyeInner: 362,
} as const;

/* ── Activation functions ─────────────────────────────────── */

export function neutralActivation(): AuActivation {
  return { au4: 0, au12: 0, au17: 0, au20: 0, au23: 0, au25: 0, au26: 0 };
}

/**
 * Compute AU activations from 478 Face Mesh normalized landmarks.
 */
export function computeAuFromLandmarks(landmarks: Point2D[]): AuActivation {
  if (landmarks.length < 468) {
    return neutralActivation();
  }

  const refDist = distance(
    landmarks[LANDMARKS.leftEyeInner],
    landmarks[LANDMARKS.rightEyeInner]
  );
  if (refDist < 0.001) {
    return neutralActivation();
  }

  const leftBrowEyeDist = distance(landmarks[LANDMARKS.leftBrowInner], landmarks[LANDMARKS.leftEyeUpper]);
  const rightBrowEyeDist = distance(landmarks[LANDMARKS.rightBrowInner], landmarks[LANDMARKS.rightEyeUpper]);
  const browDist = (leftBrowEyeDist + rightBrowEyeDist) / 2 / refDist;
  const au4 = clamp01(1 - browDist * 3);

  const lipWidth = distance(landmarks[LANDMARKS.lipLeft], landmarks[LANDMARKS.lipRight]) / refDist;
  const au12 = clamp01((lipWidth - 1.2) * 2);

  const chinLipDist = distance(landmarks[LANDMARKS.chinBottom], landmarks[LANDMARKS.lowerLipBottom]) / refDist;
  const au17 = clamp01(1 - chinLipDist * 4);

  const lowerLipWidth = distance(landmarks[LANDMARKS.lipLeftLower], landmarks[LANDMARKS.lipRightLower]) / refDist;
  const au20 = clamp01((lowerLipWidth - 1.0) * 2.5);

  const lipHeight = distance(landmarks[LANDMARKS.lipUpperCenter], landmarks[LANDMARKS.lipLowerCenter]) / refDist;
  const au23 = clamp01(1 - lipHeight * 6);

  const lipGap = distance(landmarks[LANDMARKS.upperLipBottom], landmarks[LANDMARKS.lowerLipTop]) / refDist;
  const au25 = clamp01(lipGap * 8);

  const jawDrop = distance(landmarks[LANDMARKS.noseBase], landmarks[LANDMARKS.jawTip]) / refDist;
  const au26 = clamp01((jawDrop - 1.5) * 1.5);

  return { au4, au12, au17, au20, au23, au25, au26 };
}

/**
 * Estimate AU-like features from frame pixel statistics (fallback).
 */
export function computeAuFromFrame(
  width: number,
  height: number,
  pixels: Uint8ClampedArray
): AuActivation {
  const roiX0 = Math.floor(width * 0.30);
  const roiX1 = Math.floor(width * 0.70);
  const roiY0 = Math.floor(height * 0.10);
  const roiY1 = Math.floor(height * 0.60);

  let sumR = 0, sumG = 0, sumB = 0;
  let count = 0;
  const step = 4;

  for (let y = roiY0; y < roiY1; y += step) {
    for (let x = roiX0; x < roiX1; x += step) {
      const i = (y * width + x) * 4;
      sumR += pixels[i];
      sumG += pixels[i + 1];
      sumB += pixels[i + 2];
      count++;
    }
  }

  if (count === 0) {
    return neutralActivation();
  }

  const meanR = sumR / count / 255;
  const meanG = sumG / count / 255;
  const meanB = sumB / count / 255;

  const redness = meanR - (meanG + meanB) / 2;
  const brightness = (meanR + meanG + meanB) / 3;

  return {
    au4: clamp01(redness * 3),
    au12: clamp01((brightness - 0.4) * 2),
    au17: clamp01(Math.abs(brightness - 0.5) * 2),
    au20: clamp01(meanG - meanB),
    au23: clamp01(1 - brightness),
    au25: clamp01(brightness * 0.5),
    au26: clamp01(Math.abs(redness) * 2),
  };
}

/* ── Scoring ──────────────────────────────────────────────── */

/**
 * Compute composite AU anomaly score by comparing activations to baseline.
 */
export function computeAuAnomalyScore(
  current: AuActivation,
  base: AuActivation
): number {
  const keys: (keyof AuActivation)[] = [
    "au4", "au12", "au17", "au20", "au23", "au25", "au26"
  ];

  const weights: Record<keyof AuActivation, number> = {
    au4: 1.5,
    au12: 0.8,
    au17: 1.0,
    au20: 1.0,
    au23: 1.3,
    au25: 0.7,
    au26: 0.9,
  };

  let weightedSum = 0;
  let totalWeight = 0;

  for (const key of keys) {
    const deviation = Math.abs(current[key] - base[key]);
    weightedSum += deviation * weights[key];
    totalWeight += weights[key];
  }

  return clamp01(weightedSum / totalWeight * 2.5);
}

/**
 * Average AU activations for baseline computation.
 */
export function averageActivations(frames: AuActivation[]): AuActivation {
  if (frames.length === 0) {
    return neutralActivation();
  }

  const sum = neutralActivation();
  const keys: (keyof AuActivation)[] = [
    "au4", "au12", "au17", "au20", "au23", "au25", "au26"
  ];

  for (const frame of frames) {
    for (const key of keys) {
      sum[key] += frame[key];
    }
  }

  for (const key of keys) {
    sum[key] /= frames.length;
  }

  return sum;
}
