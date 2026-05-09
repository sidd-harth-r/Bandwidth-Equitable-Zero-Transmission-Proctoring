/**
 * Coordinator — Multi-Channel Worker Orchestrator
 *
 * Manages the lifecycle of all four detection workers (PoseGaze, rPPG, AU, Keystroke)
 * plus the AudioAnalyser. Collects per-channel scores, dispatches them to the
 * FusionEngine, and emits unified AnomalyScorePayloads.
 *
 * Design decisions:
 * - Each visual worker (PoseGaze, rPPG, AU) receives the same video frames.
 * - KeystrokeWorker receives keyboard events, not frames.
 * - AudioAnalyser runs in the main thread (AudioWorklet limitation).
 * - Channel scores are collected asynchronously; fusion runs on every update.
 */

import { FusionEngine } from "./FusionEngine";
import { TierClassifier } from "./TierClassifier";
import type {
  AnomalyScorePayload,
  AuScoreMessage,
  ChannelScores,
  ChannelWeightConfig,
  FusionResult,
  Gear,
  KeystrokeScoreMessage,
  RppgScoreMessage,
  TierThresholdConfig,
  WorkerScoreMessage,
  GearConfigMessage
} from "./types";
import { AudioAnalyser } from "../audio/worklets/AudioAnalysisWorklet";
import { GearStateMachine } from "../network/GearStateMachine";

/* ── Types ────────────────────────────────────────────────── */

export interface CoordinatorConfig {
  sessionId: string;
  studentId: string;
  weights?: Partial<ChannelWeightConfig>;
  thresholds?: Partial<TierThresholdConfig>;
  gear?: Gear;
}

export interface CoordinatorCallbacks {
  onAnomalyScore: (payload: AnomalyScorePayload) => void | Promise<void>;
  onCalibrationProgress?: (channel: string, progress: string) => void;
  onError?: (channel: string, error: unknown) => void;
}

/* ── Coordinator ──────────────────────────────────────────── */

export class Coordinator {
  private fusionEngine: FusionEngine;
  private tierClassifier: TierClassifier;
  private callbacks: CoordinatorCallbacks;
  private config: CoordinatorConfig;

  // Workers
  private poseGazeWorker: Worker | null = null;
  private rppgWorker: Worker | null = null;
  private auWorker: Worker | null = null;
  private keystrokeWorker: Worker | null = null;
  private flModelWorker: Worker | null = null;
  private audioAnalyser: AudioAnalyser | null = null;
  private gearStateMachine: GearStateMachine | null = null;

  // Latest per-channel scores
  private channelScores: ChannelScores = {
    pose_gaze: 0,
    rppg: 0,
    au: 0,
    keystroke: 0,
  };

  // Channel readiness tracking
  private channelReady = {
    pose_gaze: false,
    rppg: false,
    au: false,
    keystroke: false,
    audio: false,
  };

  private running = false;
  private gear: Gear;

  constructor(config: CoordinatorConfig, callbacks: CoordinatorCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
    this.gear = config.gear ?? "gear_1";

    this.fusionEngine = new FusionEngine(config.weights);
    this.tierClassifier = new TierClassifier(config.thresholds);
  }

  /* ── Lifecycle ─────────────────────────────────────────── */

  /**
   * Start all workers and begin scoring.
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    this.startPoseGazeWorker();
    this.startRppgWorker();
    this.startAuWorker();
    this.startKeystrokeWorker();
    this.startFlModelWorker();
    this.startAudioAnalyser();

    this.gearStateMachine = new GearStateMachine(
      this.handleGearChange.bind(this),
      this.handleExamSuspend.bind(this)
    );
    // Initial broadcast
    this.broadcastGearConfig();
  }

  /**
   * Stop all workers and clean up.
   */
  stop(): void {
    this.running = false;

    this.poseGazeWorker?.postMessage({ type: "stop" });
    this.poseGazeWorker?.terminate();
    this.poseGazeWorker = null;

    this.rppgWorker?.postMessage({ type: "stop" });
    this.rppgWorker?.terminate();
    this.rppgWorker = null;

    this.auWorker?.postMessage({ type: "stop" });
    this.auWorker?.terminate();
    this.auWorker = null;

    this.keystrokeWorker?.postMessage({ type: "stop" });
    this.keystrokeWorker?.terminate();
    this.keystrokeWorker = null;

    this.flModelWorker?.postMessage({ type: "stop" });
    this.flModelWorker?.terminate();
    this.flModelWorker = null;

    this.audioAnalyser?.stop();
    this.audioAnalyser = null;

    this.gearStateMachine?.destroy();
    this.gearStateMachine = null;
  }

  /* ── Frame distribution ────────────────────────────────── */

  /**
   * Send a video frame to all visual workers.
   * Called from the main thread's frame pump.
   */
  sendFrame(width: number, height: number, pixels: Uint8ClampedArray): void {
    if (!this.running) return;

    const frameMsg = { type: "frame" as const, width, height, pixels };

    this.poseGazeWorker?.postMessage(frameMsg);
    this.rppgWorker?.postMessage(frameMsg);
    this.auWorker?.postMessage(frameMsg);
  }

  /**
   * Forward keyboard events to the keystroke worker.
   * Key identity is used transiently and discarded after timing extraction.
   */
  sendKeydown(key: string, timestamp: number): void {
    if (!this.running) return;
    this.keystrokeWorker?.postMessage({
      type: "keydown",
      key,
      timestamp,
    });
  }

  sendKeyup(key: string, timestamp: number): void {
    if (!this.running) return;
    this.keystrokeWorker?.postMessage({
      type: "keyup",
      key,
      timestamp,
    });
  }

  sendPaste(timestamp: number, length: number): void {
    if (!this.running) return;
    this.keystrokeWorker?.postMessage({
      type: "paste",
      timestamp,
      length,
    });
  }

  /**
   * Feed audio frequency magnitudes to the audio analyser.
   */
  sendAudioMagnitudes(magnitudes: ArrayLike<number>): void {
    if (!this.running) return;
    this.audioAnalyser?.processMagnitudes(magnitudes as number[]);
  }

  /* ── Gear management ───────────────────────────────────── */

  setGear(gear: Gear): void {
    this.gear = gear;
  }

  getGear(): Gear {
    return this.gear;
  }

  /* ── Weight / threshold updates ────────────────────────── */

  updateWeights(patch: Partial<ChannelWeightConfig>): void {
    this.fusionEngine.updateWeights(patch);
  }

  updateThresholds(patch: Partial<TierThresholdConfig>): void {
    this.tierClassifier.updateThresholds(patch);
  }

  /* ── Channel readiness ─────────────────────────────────── */

  getChannelReadiness(): Record<string, boolean> {
    return { ...this.channelReady };
  }

  getLatestScores(): Readonly<ChannelScores> {
    return { ...this.channelScores };
  }

  /* ── Worker initialization ─────────────────────────────── */

  private startPoseGazeWorker(): void {
    try {
      this.poseGazeWorker = new Worker(
        new URL("../workers/PoseGazeWorker.ts", import.meta.url),
        { type: "module" }
      );
      this.poseGazeWorker.onmessage = (event: MessageEvent<WorkerScoreMessage>) => {
        this.handlePoseGazeScore(event.data);
      };
      this.poseGazeWorker.onerror = (err) => {
        this.callbacks.onError?.("pose_gaze", err);
      };
      this.poseGazeWorker.postMessage({ type: "start" });
    } catch (err) {
      this.callbacks.onError?.("pose_gaze", err);
    }
  }

  private startRppgWorker(): void {
    try {
      this.rppgWorker = new Worker(
        new URL("../workers/RppgWorker.ts", import.meta.url),
        { type: "module" }
      );
      this.rppgWorker.onmessage = (event: MessageEvent<RppgScoreMessage>) => {
        this.handleRppgScore(event.data);
      };
      this.rppgWorker.onerror = (err) => {
        this.callbacks.onError?.("rppg", err);
      };
      this.rppgWorker.postMessage({ type: "start" });
    } catch (err) {
      this.callbacks.onError?.("rppg", err);
    }
  }

  private startFlModelWorker(): void {
    try {
      this.flModelWorker = new Worker(
        new URL("../workers/FlModelWorker.ts", import.meta.url),
        { type: "module" }
      );
      this.flModelWorker.onmessage = (event: MessageEvent<any>) => {
        if (event.data.type === "fl_model_score") {
          // We can attach this to fusion or just log it
        }
      };
      this.flModelWorker.onerror = (err) => {
        this.callbacks.onError?.("fl_model", err);
      };
      this.flModelWorker.postMessage({ type: "start" });
    } catch (err) {
      this.callbacks.onError?.("fl_model", err);
    }
  }

  private handleGearChange(newGear: Gear, rtt: number, plr: number): void {
    console.log(`[Coordinator] Network transition: ${this.gear} -> ${newGear} (RTT: ${rtt}ms, PLR: ${plr})`);
    this.gear = newGear;
    this.broadcastGearConfig();
  }

  private handleExamSuspend(): void {
    console.warn("[Coordinator] EXAM_SUSPEND triggered due to prolonged Gear 4 state.");
    // In a full implementation, we'd fire an event to lock the UI and notify the server.
    // Assuming callbacks might have an onSuspend, otherwise we just stop workers.
    this.stop();
    // Dispatch a global event for the UI to pick up
    window.dispatchEvent(new CustomEvent("exam-suspend"));
  }

  private broadcastGearConfig(): void {
    let targetFps = 10;
    let activeChannels = { pose_gaze: true, rppg: true, au: true, keystroke: true };
    let useQuantization = false;

    if (this.gear === "gear_2") {
      targetFps = 5;
    } else if (this.gear === "gear_3") {
      targetFps = 2;
      activeChannels.rppg = false;
      activeChannels.au = false;
      useQuantization = true;
    } else if (this.gear === "gear_4") {
      targetFps = 1;
      activeChannels.rppg = false;
      activeChannels.au = false;
      useQuantization = true;
    }

    const configMsg: GearConfigMessage = {
      type: "GEAR_CONFIG",
      gear: this.gear,
      targetFps,
      activeChannels,
      useQuantization
    };

    this.fusionEngine.updateActiveChannels(activeChannels);

    this.poseGazeWorker?.postMessage(configMsg);
    this.rppgWorker?.postMessage(configMsg);
    this.auWorker?.postMessage(configMsg);
    this.keystrokeWorker?.postMessage(configMsg);
    this.flModelWorker?.postMessage(configMsg);
  }

  private startAuWorker(): void {
    try {
      this.auWorker = new Worker(
        new URL("../workers/AuWorker.ts", import.meta.url),
        { type: "module" }
      );
      this.auWorker.onmessage = (event: MessageEvent<AuScoreMessage>) => {
        this.handleAuScore(event.data);
      };
      this.auWorker.onerror = (err) => {
        this.callbacks.onError?.("au", err);
      };
      this.auWorker.postMessage({ type: "start" });
    } catch (err) {
      this.callbacks.onError?.("au", err);
    }
  }

  private startKeystrokeWorker(): void {
    try {
      this.keystrokeWorker = new Worker(
        new URL("../workers/KeystrokeWorker.ts", import.meta.url),
        { type: "module" }
      );
      this.keystrokeWorker.onmessage = (event: MessageEvent<KeystrokeScoreMessage>) => {
        this.handleKeystrokeScore(event.data);
      };
      this.keystrokeWorker.onerror = (err) => {
        this.callbacks.onError?.("keystroke", err);
      };
      this.keystrokeWorker.postMessage({ type: "start" });
    } catch (err) {
      this.callbacks.onError?.("keystroke", err);
    }
  }

  private startAudioAnalyser(): void {
    try {
      this.audioAnalyser = new AudioAnalyser();
      this.audioAnalyser.onScore((msg) => {
        this.handleAudioScore(msg);
      });
      this.audioAnalyser.start();
    } catch (err) {
      this.callbacks.onError?.("audio", err);
    }
  }

  /* ── Score handlers ────────────────────────────────────── */

  private handlePoseGazeScore(msg: WorkerScoreMessage): void {
    this.channelScores.pose_gaze = msg.score;
    this.channelReady.pose_gaze = true;

    if (msg.reason.includes("calibrat")) {
      this.callbacks.onCalibrationProgress?.("pose_gaze", msg.reason);
    }

    this.emitFusion(msg.sampledAt, msg.reason);
  }

  private handleRppgScore(msg: RppgScoreMessage): void {
    this.channelScores.rppg = msg.score;
    this.channelReady.rppg = !msg.isCalibrating;

    if (msg.isCalibrating || msg.reason.includes("calibrat")) {
      this.callbacks.onCalibrationProgress?.("rppg", msg.reason);
    }

    this.emitFusion(msg.sampledAt, msg.reason);
  }

  private handleAuScore(msg: AuScoreMessage): void {
    this.channelScores.au = msg.score;
    this.channelReady.au = !msg.isCalibrating;

    if (msg.isCalibrating || msg.reason.includes("calibrat")) {
      this.callbacks.onCalibrationProgress?.("au", msg.reason);
    }

    this.emitFusion(msg.sampledAt, msg.reason);
  }

  private handleKeystrokeScore(msg: KeystrokeScoreMessage): void {
    this.channelScores.keystroke = msg.score;
    this.channelReady.keystroke = !msg.isCalibrating;

    if (msg.isCalibrating || msg.reason.includes("calibrat")) {
      this.callbacks.onCalibrationProgress?.("keystroke", msg.reason);
    }

    this.emitFusion(msg.sampledAt, msg.reason);
  }

  private handleAudioScore(msg: { score: number; reason: string; sampledAt: string; isCalibrating: boolean }): void {
    // Audio contributes to AU channel weight adjustment but doesn't have its own channel in ChannelScores
    // For now, we blend audio into the AU channel when voice is unexpectedly detected
    this.channelReady.audio = !msg.isCalibrating;

    if (msg.isCalibrating || msg.reason.includes("calibrat")) {
      this.callbacks.onCalibrationProgress?.("audio", msg.reason);
    }
  }

  /* ── Fusion & emission ─────────────────────────────────── */

  private emitFusion(sampledAt: string, reason: string): void {
    const fusion: FusionResult = this.fusionEngine.fuse(this.channelScores);
    const tier = this.tierClassifier.classify(fusion);

    const payload: AnomalyScorePayload = {
      ...fusion,
      session_id: this.config.sessionId,
      student_id: this.config.studentId,
      occurred_at: sampledAt,
      tier,
      gear: this.gear,
      metadata: {
        source: "coordinator",
        trigger_channel: reason,
      },
    };

    void this.callbacks.onAnomalyScore(payload);
  }
}
