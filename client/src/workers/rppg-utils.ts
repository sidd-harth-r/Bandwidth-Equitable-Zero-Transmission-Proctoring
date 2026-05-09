/**
 * rPPG Signal Processing Utilities
 *
 * Pure functions for green-channel extraction, FIR filtering,
 * heart-rate estimation, and score computation.
 * Extracted from RppgWorker for testability outside the Web Worker context.
 */

/* ── FIR bandpass filter ─────────────────────────────────── */

/**
 * Generate FIR bandpass filter coefficients using a windowed sinc method.
 * Uses a Hamming window for smooth spectral roll-off.
 */
export function generateBandpassCoefficients(
  lowHz: number,
  highHz: number,
  sampleRate: number,
  order: number
): number[] {
  const coeffs: number[] = [];
  const middle = order / 2;
  const lowNorm = lowHz / sampleRate;
  const highNorm = highHz / sampleRate;

  for (let n = 0; n <= order; n++) {
    const hamming = 0.54 - 0.46 * Math.cos((2 * Math.PI * n) / order);
    let sinc: number;
    if (n === middle) {
      sinc = 2 * (highNorm - lowNorm);
    } else {
      const x = n - middle;
      sinc =
        (Math.sin(2 * Math.PI * highNorm * x) -
          Math.sin(2 * Math.PI * lowNorm * x)) /
        (Math.PI * x);
    }
    coeffs.push(sinc * hamming);
  }

  // Normalize
  const sum = coeffs.reduce((a, b) => a + b, 0);
  if (Math.abs(sum) > 1e-10) {
    for (let i = 0; i < coeffs.length; i++) {
      coeffs[i] /= sum;
    }
  }

  return coeffs;
}

/**
 * Apply FIR bandpass filter to a signal buffer.
 * Returns the filtered value for the latest sample.
 */
export function applyFirFilter(buffer: number[], coefficients: number[]): number {
  if (buffer.length < coefficients.length) {
    return 0;
  }

  let output = 0;
  const offset = buffer.length - coefficients.length;
  for (let i = 0; i < coefficients.length; i++) {
    output += coefficients[i] * buffer[offset + i];
  }
  return output;
}

/* ── Green-channel extraction ─────────────────────────────── */

/**
 * Extract green-channel mean from the facial-center region of a frame.
 * Uses the central 30% of the frame as a rough face-skin proxy.
 */
export function extractGreenChannelMean(
  width: number,
  height: number,
  pixels: Uint8ClampedArray
): number {
  const roiX0 = Math.floor(width * 0.35);
  const roiX1 = Math.floor(width * 0.65);
  const roiY0 = Math.floor(height * 0.20);
  const roiY1 = Math.floor(height * 0.55);

  let greenSum = 0;
  let count = 0;
  const step = 2;

  for (let y = roiY0; y < roiY1; y += step) {
    for (let x = roiX0; x < roiX1; x += step) {
      const index = (y * width + x) * 4;
      greenSum += pixels[index + 1]; // Green channel
      count++;
    }
  }

  return count > 0 ? greenSum / count / 255 : 0.5;
}

/* ── Heart rate estimation ────────────────────────────────── */

/**
 * Estimate heart rate from filtered signal using zero-crossing method.
 * Returns estimated BPM or null if insufficient data.
 */
export function estimateHeartRate(signal: number[], sampleRate = 10): number | null {
  if (signal.length < sampleRate * 3) {
    return null;
  }

  const window = signal.slice(-sampleRate * 5);
  let crossings = 0;
  for (let i = 1; i < window.length; i++) {
    if ((window[i - 1] < 0 && window[i] >= 0) || (window[i - 1] >= 0 && window[i] < 0)) {
      crossings++;
    }
  }

  const durationSeconds = window.length / sampleRate;
  const frequencyHz = crossings / (2 * durationSeconds);
  const bpm = frequencyHz * 60;

  if (bpm < 40 || bpm > 200) {
    return null;
  }

  return Math.round(bpm);
}

/* ── Signal statistics ────────────────────────────────────── */

/**
 * Compute signal variance over the recent window.
 */
export function computeSignalVariance(signal: number[], sampleRate = 10): number {
  if (signal.length < 10) {
    return 0;
  }

  const recent = signal.slice(-sampleRate * 5);
  const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
  const variance = recent.reduce((sum, v) => sum + (v - mean) ** 2, 0) / recent.length;
  return variance;
}

/**
 * Compute signal quality indicator (0–1) via autocorrelation.
 */
export function computeSignalQuality(signal: number[], sampleRate = 10): number {
  if (signal.length < sampleRate * 2) {
    return 0;
  }

  const recent = signal.slice(-sampleRate * 3);
  const amplitude = Math.max(...recent) - Math.min(...recent);

  if (amplitude < 0.001) {
    return 0;
  }

  const minLag = Math.floor(sampleRate * 60 / 200);
  const maxLag = Math.floor(sampleRate * 60 / 40);
  const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
  let maxCorr = 0;

  for (let lag = minLag; lag <= Math.min(maxLag, recent.length / 2); lag++) {
    let corr = 0;
    let norm1 = 0;
    let norm2 = 0;
    for (let i = 0; i < recent.length - lag; i++) {
      const a = recent[i] - mean;
      const b = recent[i + lag] - mean;
      corr += a * b;
      norm1 += a * a;
      norm2 += b * b;
    }
    const denom = Math.sqrt(norm1 * norm2);
    if (denom > 1e-10) {
      maxCorr = Math.max(maxCorr, corr / denom);
    }
  }

  return Math.max(0, Math.min(1, maxCorr));
}

/* ── Scoring ──────────────────────────────────────────────── */

/**
 * Compute rPPG anomaly score by comparing current HR and variance to baseline.
 */
export function computeRppgScore(
  heartRate: number | null,
  variance: number,
  baseHr: number,
  baseVar: number
): number {
  let score = 0;

  if (heartRate !== null) {
    const hrDeviation = Math.abs(heartRate - baseHr) / Math.max(baseHr, 1);
    score += Math.min(1, hrDeviation * 2) * 0.6;
  }

  const varDeviation = Math.abs(variance - baseVar) / Math.max(baseVar, 0.001);
  score += Math.min(1, varDeviation * 1.5) * 0.4;

  return Math.max(0, Math.min(1, score));
}
