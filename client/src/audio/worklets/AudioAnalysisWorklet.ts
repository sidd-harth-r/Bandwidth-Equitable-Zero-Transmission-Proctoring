/**
 * AudioAnalysisWorklet — Audio Feature Extraction
 *
 * Extracts spectral energy, voice-activity detection, and voice-profile
 * baseline features from the audio stream. Runs in the main thread context
 * (AudioWorklet API is not available in Web Workers, so this module provides
 * the processing logic that can be used from an AudioWorkletProcessor or
 * called directly from the main thread).
 *
 * Privacy: Only spectral features and voice-presence flags are emitted.
 * No raw audio samples or voice recordings leave this module.
 */

import type { AudioScoreMessage } from "../../coordinator/types";

/* ── Configuration ────────────────────────────────────────── */

const FFT_SIZE = 512;
const CALIBRATION_FRAME_TARGET = 50; // ~5 seconds at 10 fps
const EMIT_INTERVAL_MS = 2000;

/* ── Frequency band boundaries (Hz) ──────────────────────── */

const BANDS = {
  subBass: { low: 20, high: 100 },
  bass: { low: 100, high: 300 },
  speech: { low: 300, high: 3400 },
  highMid: { low: 3400, high: 6000 },
  high: { low: 6000, high: 20000 },
} as const;

/* ── Types ────────────────────────────────────────────────── */

export interface SpectralFeatures {
  totalEnergy: number;
  speechBandEnergy: number;
  spectralCentroid: number;
  spectralFlatness: number;
  voicePresent: boolean;
}

interface AudioBaseline {
  meanEnergy: number;
  meanSpeechEnergy: number;
  meanCentroid: number;
  energyVariance: number;
  voiceRate: number;
}

/* ── Spectral analysis ────────────────────────────────────── */

/**
 * Compute spectral features from a frequency-domain magnitude array.
 * @param magnitudes — FFT magnitude bins (from AnalyserNode.getFloatFrequencyData or manual FFT)
 * @param sampleRate — audio sample rate (e.g. 44100)
 * @param fftSize — FFT size used
 */
export function computeSpectralFeatures(
  magnitudes: Float32Array | number[],
  sampleRate: number,
  fftSize: number
): SpectralFeatures {
  const binCount = magnitudes.length;
  const binWidth = sampleRate / fftSize;

  let totalEnergy = 0;
  let speechBandEnergy = 0;
  let weightedFreqSum = 0;
  let logProductSum = 0;
  let validBins = 0;

  for (let i = 1; i < binCount; i++) {
    const freq = i * binWidth;
    // Convert from dB to linear magnitude if negative values present
    const raw = magnitudes[i];
    const linear = raw < 0 ? Math.pow(10, raw / 20) : raw;
    const power = linear * linear;

    totalEnergy += power;
    weightedFreqSum += freq * power;

    if (freq >= BANDS.speech.low && freq <= BANDS.speech.high) {
      speechBandEnergy += power;
    }

    if (power > 1e-20) {
      logProductSum += Math.log(power);
      validBins++;
    }
  }

  const spectralCentroid = totalEnergy > 1e-10
    ? weightedFreqSum / totalEnergy
    : 0;

  // Spectral flatness: geometric mean / arithmetic mean of power spectrum
  // A value close to 1 = noise-like, close to 0 = tonal
  let spectralFlatness = 0;
  if (validBins > 0 && totalEnergy > 1e-10) {
    const geometricMean = Math.exp(logProductSum / validBins);
    const arithmeticMean = totalEnergy / validBins;
    spectralFlatness = arithmeticMean > 1e-20
      ? Math.min(1, geometricMean / arithmeticMean)
      : 0;
  }

  // Voice Activity Detection (VAD): speech band energy > threshold
  // and centroid in voice range
  const voicePresent =
    speechBandEnergy > totalEnergy * 0.3 &&
    spectralCentroid > 200 &&
    spectralCentroid < 4000 &&
    totalEnergy > 1e-8;

  return {
    totalEnergy: Math.min(1, totalEnergy * 1000),
    speechBandEnergy: Math.min(1, speechBandEnergy * 1000),
    spectralCentroid,
    spectralFlatness,
    voicePresent,
  };
}

/* ── AudioAnalyser class ──────────────────────────────────── */

/**
 * Manages audio analysis state, baseline calibration, and score emission.
 * Can be used from the main thread with Web Audio API's AnalyserNode,
 * or fed synthetic data for testing.
 */
export class AudioAnalyser {
  private running = false;
  private calibrating = false;
  private baseline: AudioBaseline | null = null;
  private calibrationFrames: SpectralFeatures[] = [];
  private emitCallback: ((message: AudioScoreMessage) => void) | null = null;
  private emitIntervalId: ReturnType<typeof setInterval> | undefined;
  private latestFeatures: SpectralFeatures | null = null;
  private sampleRate: number;
  private fftSize: number;

  constructor(sampleRate = 44100, fftSize = FFT_SIZE) {
    this.sampleRate = sampleRate;
    this.fftSize = fftSize;
  }

  /** Set callback for score emission */
  onScore(callback: (message: AudioScoreMessage) => void): void {
    this.emitCallback = callback;
  }

  /** Start analysis and begin calibration */
  start(): void {
    this.running = true;
    this.calibrating = true;
    this.calibrationFrames = [];
    this.baseline = null;
    this.latestFeatures = null;

    if (this.emitIntervalId !== undefined) {
      clearInterval(this.emitIntervalId);
    }
    this.emitIntervalId = setInterval(() => this.emitScore(), EMIT_INTERVAL_MS);
  }

  /** Stop analysis */
  stop(): void {
    this.running = false;
    this.calibrating = false;
    if (this.emitIntervalId !== undefined) {
      clearInterval(this.emitIntervalId);
      this.emitIntervalId = undefined;
    }
  }

  /** Feed a frame of frequency magnitudes for analysis */
  processMagnitudes(magnitudes: Float32Array | number[]): void {
    if (!this.running) return;

    const features = computeSpectralFeatures(
      magnitudes,
      this.sampleRate,
      this.fftSize
    );
    this.latestFeatures = features;

    if (this.calibrating) {
      this.calibrationFrames.push(features);

      if (this.calibrationFrames.length >= CALIBRATION_FRAME_TARGET) {
        this.baseline = this.computeBaseline(this.calibrationFrames);
        this.calibrating = false;
        this.calibrationFrames = [];
      }
    }
  }

  /** Set baseline externally (e.g. restored from a previous session) */
  setBaseline(baseline: AudioBaseline): void {
    this.baseline = baseline;
    this.calibrating = false;
  }

  getBaseline(): AudioBaseline | null {
    return this.baseline;
  }

  isCalibrating(): boolean {
    return this.calibrating;
  }

  private computeBaseline(frames: SpectralFeatures[]): AudioBaseline {
    const n = frames.length;
    let sumEnergy = 0;
    let sumSpeech = 0;
    let sumCentroid = 0;
    let voiceCount = 0;

    for (const f of frames) {
      sumEnergy += f.totalEnergy;
      sumSpeech += f.speechBandEnergy;
      sumCentroid += f.spectralCentroid;
      if (f.voicePresent) voiceCount++;
    }

    const meanEnergy = sumEnergy / n;
    const meanSpeechEnergy = sumSpeech / n;
    const meanCentroid = sumCentroid / n;
    const voiceRate = voiceCount / n;

    let varianceSum = 0;
    for (const f of frames) {
      varianceSum += (f.totalEnergy - meanEnergy) ** 2;
    }

    return {
      meanEnergy,
      meanSpeechEnergy,
      meanCentroid,
      energyVariance: varianceSum / n,
      voiceRate,
    };
  }

  private emitScore(): void {
    if (!this.running || !this.emitCallback) return;

    const features = this.latestFeatures;
    if (!features) return;

    if (this.calibrating) {
      const progress = Math.round(
        (this.calibrationFrames.length / CALIBRATION_FRAME_TARGET) * 100
      );
      this.emitCallback({
        type: "audio_score",
        score: 0,
        reason: `calibrating_${progress}pct`,
        sampledAt: new Date().toISOString(),
        spectralEnergy: features.totalEnergy,
        voicePresent: features.voicePresent,
        isCalibrating: true,
      });
      return;
    }

    if (!this.baseline) {
      this.emitCallback({
        type: "audio_score",
        score: 0,
        reason: "no_baseline",
        sampledAt: new Date().toISOString(),
        spectralEnergy: features.totalEnergy,
        voicePresent: features.voicePresent,
        isCalibrating: false,
      });
      return;
    }

    const score = this.computeAudioScore(features, this.baseline);

    this.emitCallback({
      type: "audio_score",
      score,
      reason: features.voicePresent ? "voice_detected" : "audio_active",
      sampledAt: new Date().toISOString(),
      spectralEnergy: features.totalEnergy,
      voicePresent: features.voicePresent,
      isCalibrating: false,
    });
  }

  private computeAudioScore(
    features: SpectralFeatures,
    baseline: AudioBaseline
  ): number {
    let score = 0;

    // Energy deviation from baseline
    if (baseline.meanEnergy > 1e-6) {
      const energyDev = Math.abs(features.totalEnergy - baseline.meanEnergy) / baseline.meanEnergy;
      score += Math.min(1, energyDev * 1.5) * 0.25;
    }

    // Speech band energy deviation
    if (baseline.meanSpeechEnergy > 1e-6) {
      const speechDev = Math.abs(features.speechBandEnergy - baseline.meanSpeechEnergy) / baseline.meanSpeechEnergy;
      score += Math.min(1, speechDev * 1.5) * 0.25;
    }

    // Voice presence when baseline had no voice (or vice versa)
    if (features.voicePresent && baseline.voiceRate < 0.1) {
      // Voice detected but baseline was quiet → suspicious
      score += 0.30;
    } else if (!features.voicePresent && baseline.voiceRate > 0.7) {
      // No voice but baseline had voice → unusual but less suspicious
      score += 0.10;
    }

    // Spectral centroid shift
    if (baseline.meanCentroid > 10) {
      const centroidDev = Math.abs(features.spectralCentroid - baseline.meanCentroid) / baseline.meanCentroid;
      score += Math.min(1, centroidDev * 2) * 0.20;
    }

    return Math.max(0, Math.min(1, score));
  }
}
