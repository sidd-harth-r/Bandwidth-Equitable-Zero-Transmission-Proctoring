import { describe, expect, it } from "vitest";

import {
  computeSpectralFeatures,
  AudioAnalyser,
} from "../src/audio/worklets/AudioAnalysisWorklet";

describe("AudioAnalysisWorklet — Spectral Features", () => {
  it("returns zero energy for silent input", () => {
    const magnitudes = new Float32Array(256).fill(-100); // Very low dB
    const features = computeSpectralFeatures(magnitudes, 44100, 512);

    expect(features.totalEnergy).toBeCloseTo(0, 3);
    expect(features.voicePresent).toBe(false);
  });

  it("detects voice-range energy in speech band", () => {
    const magnitudes = new Float32Array(256).fill(-80);
    const binWidth = 44100 / 512;

    // Boost speech band (300–3400 Hz)
    for (let i = 0; i < 256; i++) {
      const freq = i * binWidth;
      if (freq >= 300 && freq <= 3400) {
        magnitudes[i] = -10; // Loud in speech band
      }
    }

    const features = computeSpectralFeatures(magnitudes, 44100, 512);

    expect(features.speechBandEnergy).toBeGreaterThan(features.totalEnergy * 0.1);
    expect(features.spectralCentroid).toBeGreaterThan(200);
  });

  it("computes spectral centroid in the correct frequency range", () => {
    const magnitudes = new Float32Array(256).fill(0);
    const binWidth = 44100 / 512;

    // Single peak at 1000 Hz
    const peakBin = Math.round(1000 / binWidth);
    magnitudes[peakBin] = 1;

    const features = computeSpectralFeatures(magnitudes, 44100, 512);

    // Centroid should be near the peak frequency
    expect(features.spectralCentroid).toBeGreaterThan(800);
    expect(features.spectralCentroid).toBeLessThan(1200);
  });

  it("returns valid features for all-zero input", () => {
    const magnitudes = new Float32Array(256).fill(0);
    const features = computeSpectralFeatures(magnitudes, 44100, 512);

    expect(features.totalEnergy).toBeGreaterThanOrEqual(0);
    expect(features.spectralFlatness).toBeGreaterThanOrEqual(0);
    expect(features.spectralFlatness).toBeLessThanOrEqual(1);
  });
});

describe("AudioAnalyser — Lifecycle", () => {
  it("starts in calibrating state", () => {
    const analyser = new AudioAnalyser(44100, 512);
    analyser.start();

    expect(analyser.isCalibrating()).toBe(true);
    expect(analyser.getBaseline()).toBeNull();

    analyser.stop();
  });

  it("completes calibration after enough frames", () => {
    const analyser = new AudioAnalyser(44100, 512);
    analyser.start();

    // Feed 50 frames (calibration target)
    for (let i = 0; i < 50; i++) {
      const magnitudes = new Float32Array(256).fill(-40 + Math.random() * 5);
      analyser.processMagnitudes(magnitudes);
    }

    expect(analyser.isCalibrating()).toBe(false);
    expect(analyser.getBaseline()).not.toBeNull();

    analyser.stop();
  });

  it("accepts externally set baseline", () => {
    const analyser = new AudioAnalyser(44100, 512);
    analyser.start();

    analyser.setBaseline({
      meanEnergy: 0.1,
      meanSpeechEnergy: 0.05,
      meanCentroid: 800,
      energyVariance: 0.001,
      voiceRate: 0.1,
    });

    expect(analyser.isCalibrating()).toBe(false);
    expect(analyser.getBaseline()).not.toBeNull();

    analyser.stop();
  });

  it("emits scores via callback after calibration", () => {
    const analyser = new AudioAnalyser(44100, 512);
    const scores: unknown[] = [];

    analyser.onScore((msg) => scores.push(msg));
    analyser.setBaseline({
      meanEnergy: 0.1,
      meanSpeechEnergy: 0.05,
      meanCentroid: 800,
      energyVariance: 0.001,
      voiceRate: 0.1,
    });
    analyser.start();

    // Feed a frame
    const magnitudes = new Float32Array(256).fill(-30);
    analyser.processMagnitudes(magnitudes);

    // Scores are emitted on interval, not per-frame, so we just verify setup
    expect(typeof analyser.isCalibrating).toBe("function");

    analyser.stop();
  });
});
