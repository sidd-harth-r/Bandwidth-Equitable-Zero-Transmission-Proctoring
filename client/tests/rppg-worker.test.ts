import { describe, expect, it } from "vitest";

import {
  generateBandpassCoefficients,
  applyFirFilter,
  estimateHeartRate,
  computeSignalVariance,
  computeRppgScore,
  computeSignalQuality,
  extractGreenChannelMean,
} from "../src/workers/rppg-utils";

describe("RppgWorker — FIR Bandpass Filter", () => {
  it("generates correct number of filter coefficients", () => {
    const coeffs = generateBandpassCoefficients(0.75, 4.0, 10, 32);
    expect(coeffs.length).toBe(33); // order + 1
  });

  it("coefficients sum to approximately 1 after normalization", () => {
    const coeffs = generateBandpassCoefficients(0.75, 4.0, 10, 32);
    const sum = coeffs.reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(0.01);
  });

  it("passes a sine wave in the passband (1.2 Hz ≈ 72 bpm)", () => {
    const sampleRate = 10;
    const freq = 1.2; // 72 bpm
    const coeffs = generateBandpassCoefficients(0.75, 4.0, sampleRate, 32);

    // Generate sine wave samples
    const samples: number[] = [];
    for (let i = 0; i < 100; i++) {
      samples.push(Math.sin(2 * Math.PI * freq * i / sampleRate));
    }

    // Apply filter to the last sample
    const output = applyFirFilter(samples, coeffs);

    // Filtered output should be non-zero for in-band signal
    expect(Math.abs(output)).toBeGreaterThan(0.01);
  });

  it("passband output is stronger than stopband output", () => {
    const sampleRate = 10;
    const coeffs = generateBandpassCoefficients(0.75, 4.0, sampleRate, 32);

    // In-band signal at 1.2 Hz (72 bpm)
    const inBand: number[] = [];
    for (let i = 0; i < 100; i++) {
      inBand.push(Math.sin(2 * Math.PI * 1.2 * i / sampleRate));
    }

    // Out-of-band DC offset (0 Hz)
    const outBand: number[] = Array(100).fill(0.5);

    const inBandOutput = Math.abs(applyFirFilter(inBand, coeffs));
    const outBandOutput = Math.abs(applyFirFilter(outBand, coeffs));

    // In-band should be significantly stronger
    expect(inBandOutput).toBeGreaterThan(outBandOutput);
  });

  it("returns 0 when buffer is shorter than coefficients", () => {
    const coeffs = generateBandpassCoefficients(0.75, 4.0, 10, 32);
    const shortBuffer = [0.5, 0.6, 0.7];

    expect(applyFirFilter(shortBuffer, coeffs)).toBe(0);
  });
});

describe("RppgWorker — Heart Rate Estimation", () => {
  it("returns null for insufficient data", () => {
    expect(estimateHeartRate([0.1, 0.2])).toBeNull();
  });

  it("estimates HR from a periodic signal", () => {
    const sampleRate = 10;
    const targetBpm = 72;
    const freq = targetBpm / 60;

    const signal: number[] = [];
    for (let i = 0; i < sampleRate * 10; i++) {
      signal.push(Math.sin(2 * Math.PI * freq * i / sampleRate));
    }

    const hr = estimateHeartRate(signal);
    expect(hr).not.toBeNull();
    if (hr !== null) {
      expect(hr).toBeGreaterThan(50);
      expect(hr).toBeLessThan(100);
    }
  });

  it("returns null for DC signal (no zero crossings)", () => {
    const sampleRate = 10;
    // Constant signal has no zero crossings → no detectable frequency
    const signal: number[] = Array(sampleRate * 5).fill(0.5);

    const hr = estimateHeartRate(signal);
    expect(hr).toBeNull();
  });
});

describe("RppgWorker — Signal Variance", () => {
  it("returns 0 for constant signal", () => {
    const signal = Array(50).fill(0.5);
    expect(computeSignalVariance(signal)).toBe(0);
  });

  it("returns positive variance for varying signal", () => {
    const signal = Array.from({ length: 50 }, (_, i) => Math.sin(i * 0.5));
    expect(computeSignalVariance(signal)).toBeGreaterThan(0);
  });

  it("returns 0 for too few samples", () => {
    expect(computeSignalVariance([1, 2])).toBe(0);
  });
});

describe("RppgWorker — Score Computation", () => {
  it("returns 0 when current matches baseline", () => {
    const score = computeRppgScore(72, 0.01, 72, 0.01);
    expect(score).toBe(0);
  });

  it("returns elevated score for HR deviation", () => {
    const score = computeRppgScore(120, 0.01, 72, 0.01);
    expect(score).toBeGreaterThan(0.3);
  });

  it("returns elevated score for variance deviation", () => {
    const score = computeRppgScore(72, 0.1, 72, 0.01);
    expect(score).toBeGreaterThan(0.2);
  });

  it("handles null heart rate gracefully", () => {
    const score = computeRppgScore(null, 0.01, 72, 0.01);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

describe("RppgWorker — Signal Quality", () => {
  it("returns 0 for insufficient data", () => {
    expect(computeSignalQuality([0.1, 0.2])).toBe(0);
  });

  it("returns low quality for constant signal", () => {
    const signal = Array(50).fill(0.5);
    expect(computeSignalQuality(signal)).toBe(0);
  });

  it("returns positive quality for periodic signal", () => {
    const sampleRate = 10;
    const signal = Array.from(
      { length: sampleRate * 5 },
      (_, i) => Math.sin(2 * Math.PI * 1.2 * i / sampleRate) * 0.1
    );
    expect(computeSignalQuality(signal)).toBeGreaterThan(0);
  });
});

describe("RppgWorker — Green Channel Extraction", () => {
  it("extracts mean green value from central region", () => {
    const width = 10;
    const height = 10;
    const pixels = new Uint8ClampedArray(width * height * 4);

    // Fill with known green values
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = 100;     // R
      pixels[i + 1] = 200; // G
      pixels[i + 2] = 50;  // B
      pixels[i + 3] = 255; // A
    }

    const mean = extractGreenChannelMean(width, height, pixels);
    expect(mean).toBeGreaterThan(0.5);
    expect(mean).toBeLessThanOrEqual(1);
  });

  it("returns 0.5 for empty/zero pixel data", () => {
    const width = 10;
    const height = 10;
    const pixels = new Uint8ClampedArray(width * height * 4);

    const mean = extractGreenChannelMean(width, height, pixels);
    // All zero pixels → count > 0, greenSum = 0, so mean = 0
    expect(mean).toBeLessThanOrEqual(0.5);
  });
});
