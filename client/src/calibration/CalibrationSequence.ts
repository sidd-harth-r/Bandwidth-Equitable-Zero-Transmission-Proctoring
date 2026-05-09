/**
 * CalibrationSequence — Unified Calibration Controller
 *
 * Orchestrates the full pre-exam calibration sequence:
 *   1. Acoustic calibration (audio baseline)
 *   2. rPPG 2-minute baseline
 *   3. Voice baseline
 *   4. Keystroke 100-word baseline
 *   5. Gear assignment based on connection quality
 *
 * This module coordinates the Coordinator's per-channel calibrations
 * into a single user-facing flow with progress reporting.
 *
 * Privacy: No raw samples stored. Only per-channel baseline readiness
 * and connection quality metrics are recorded.
 */

import type { Gear } from "../coordinator/types";

/* ── Types ────────────────────────────────────────────────── */

export type CalibrationStep =
  | "acoustic"
  | "rppg"
  | "voice"
  | "keystroke"
  | "gear_assignment";

export interface CalibrationStepStatus {
  step: CalibrationStep;
  status: "pending" | "in_progress" | "complete" | "failed";
  progressPercent: number;
  detail: string;
}

export interface CalibrationResult {
  passed: boolean;
  steps: CalibrationStepStatus[];
  assignedGear: Gear;
  totalDurationMs: number;
}

export type CalibrationCallback = (
  event:
    | { type: "step_progress"; step: CalibrationStepStatus }
    | { type: "complete"; result: CalibrationResult }
) => void;

/* ── Configuration ────────────────────────────────────────── */

const RPPG_CALIBRATION_MS = 120_000;  // 2 minutes
const ACOUSTIC_CALIBRATION_MS = 5_000;
const VOICE_CALIBRATION_MS = 10_000;
const KEYSTROKE_TARGET_KEYSTROKES = 200; // ~100 words

/* ── Connection quality estimation ────────────────────────── */

/**
 * Estimate connection quality and assign a gear.
 * Uses simple heuristics based on API response time.
 */
export async function estimateGear(apiBaseUrl = ""): Promise<{ gear: Gear; rttMs: number }> {
  try {
    const start = performance.now();
    const response = await fetch(`${apiBaseUrl}/api/v1/health`);
    const rttMs = performance.now() - start;

    if (!response.ok) {
      return { gear: "gear_3", rttMs };
    }

    if (rttMs < 100) return { gear: "gear_1", rttMs };
    if (rttMs < 300) return { gear: "gear_2", rttMs };
    if (rttMs < 1000) return { gear: "gear_3", rttMs };
    return { gear: "gear_4", rttMs };
  } catch {
    return { gear: "gear_4", rttMs: Infinity };
  }
}

/* ── CalibrationSequence class ────────────────────────────── */

export class CalibrationSequence {
  private callback: CalibrationCallback;
  private steps: Map<CalibrationStep, CalibrationStepStatus> = new Map();
  private startTime = 0;
  private running = false;

  constructor(callback: CalibrationCallback) {
    this.callback = callback;

    // Initialize all steps
    const allSteps: CalibrationStep[] = [
      "acoustic", "rppg", "voice", "keystroke", "gear_assignment"
    ];
    for (const step of allSteps) {
      this.steps.set(step, {
        step,
        status: "pending",
        progressPercent: 0,
        detail: "Waiting...",
      });
    }
  }

  /**
   * Run the full calibration sequence.
   * The caller must feed calibration progress from the Coordinator's callbacks.
   */
  async run(): Promise<CalibrationResult> {
    this.running = true;
    this.startTime = Date.now();

    // Step 1: Acoustic calibration (wait for audio baseline)
    await this.runTimedStep("acoustic", ACOUSTIC_CALIBRATION_MS);

    // Step 2: rPPG baseline (2 minutes)
    await this.runTimedStep("rppg", RPPG_CALIBRATION_MS);

    // Step 3: Voice baseline
    await this.runTimedStep("voice", VOICE_CALIBRATION_MS);

    // Step 4: Keystroke baseline
    // This is event-driven, not time-driven. We wait but the actual
    // completion comes from the KeystrokeWorker calibration callback.
    await this.runTimedStep("keystroke", 30_000); // 30s max wait

    // Step 5: Gear assignment
    this.updateStep("gear_assignment", "in_progress", 0, "Measuring connection...");
    const { gear, rttMs } = await estimateGear();
    this.updateStep(
      "gear_assignment",
      "complete",
      100,
      `Assigned ${gear} (RTT: ${Math.round(rttMs)}ms)`
    );

    this.running = false;

    const result: CalibrationResult = {
      passed: true,
      steps: Array.from(this.steps.values()),
      assignedGear: gear,
      totalDurationMs: Date.now() - this.startTime,
    };

    this.callback({ type: "complete", result });
    return result;
  }

  /**
   * Update a step's progress from external sources (e.g., Coordinator calibration callbacks).
   */
  externalUpdate(step: CalibrationStep, progressPercent: number, detail: string): void {
    const status = progressPercent >= 100 ? "complete" : "in_progress";
    this.updateStep(step, status, progressPercent, detail);
  }

  /**
   * Mark a step as failed.
   */
  markFailed(step: CalibrationStep, detail: string): void {
    this.updateStep(step, "failed", 0, detail);
  }

  private async runTimedStep(step: CalibrationStep, durationMs: number): Promise<void> {
    this.updateStep(step, "in_progress", 0, "Starting...");

    const startTime = Date.now();
    const updateInterval = Math.min(durationMs / 10, 1000);

    return new Promise<void>((resolve) => {
      const intervalId = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(100, Math.round((elapsed / durationMs) * 100));

        const currentStatus = this.steps.get(step);
        if (currentStatus?.status === "complete") {
          clearInterval(intervalId);
          resolve();
          return;
        }

        if (elapsed >= durationMs) {
          clearInterval(intervalId);
          this.updateStep(step, "complete", 100, "Baseline captured");
          resolve();
          return;
        }

        this.updateStep(step, "in_progress", progress, `${progress}% complete`);
      }, updateInterval);
    });
  }

  private updateStep(
    step: CalibrationStep,
    status: CalibrationStepStatus["status"],
    progressPercent: number,
    detail: string
  ): void {
    const stepStatus: CalibrationStepStatus = {
      step,
      status,
      progressPercent,
      detail,
    };
    this.steps.set(step, stepStatus);
    this.callback({ type: "step_progress", step: stepStatus });
  }

  isRunning(): boolean {
    return this.running;
  }

  getStepStatus(step: CalibrationStep): CalibrationStepStatus | undefined {
    return this.steps.get(step);
  }
}
