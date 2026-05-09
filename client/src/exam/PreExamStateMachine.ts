/**
 * PreExamStateMachine — Pre-Exam Verification Orchestrator
 *
 * Manages the pre-exam flow through states:
 *   idle → verification → room_scan → calibration → ready → locked (on failure)
 *
 * Each state must pass before proceeding. Failure triggers retry
 * without corrupting already-completed baselines. The exam unlocks
 * only when all checks pass.
 *
 * Privacy: No raw media is stored. Only pass/fail results and
 * timing metadata are recorded.
 */

/* ── Types ────────────────────────────────────────────────── */

export type PreExamState =
  | "idle"
  | "screen_check"
  | "gesture_verification"
  | "room_scan"
  | "calibration"
  | "ready"
  | "locked";

export interface PreExamStateInfo {
  state: PreExamState;
  detail: string;
  canRetry: boolean;
  timestamp: string;
}

export interface StepResult {
  step: PreExamState;
  passed: boolean;
  detail: string;
  durationMs: number;
}

export type PreExamCallback = (info: PreExamStateInfo) => void;

/* ── Configuration ────────────────────────────────────────── */

const MAX_RETRIES_PER_STEP = 3;

/* ── PreExamStateMachine ──────────────────────────────────── */

export class PreExamStateMachine {
  private state: PreExamState = "idle";
  private callback: PreExamCallback;
  private stepResults: StepResult[] = [];
  private retries: Record<string, number> = {};
  private _resolve: ((passed: boolean) => void) | null = null;

  // Pluggable step executors (set by the caller)
  private stepExecutors: Partial<Record<PreExamState, () => Promise<StepResult>>> = {};

  constructor(callback: PreExamCallback) {
    this.callback = callback;
  }

  /**
   * Register an executor for a step.
   * The executor should return a StepResult with passed: true/false.
   */
  registerStep(step: PreExamState, executor: () => Promise<StepResult>): void {
    this.stepExecutors[step] = executor;
  }

  /**
   * Start the pre-exam flow.
   * Returns true if all steps pass, false if any step fails after max retries.
   */
  async start(): Promise<boolean> {
    this.stepResults = [];
    this.retries = {};

    return new Promise<boolean>(async (resolve) => {
      this._resolve = resolve;

      const steps: PreExamState[] = [
        "screen_check",
        "gesture_verification",
        "room_scan",
        "calibration",
      ];

      for (const step of steps) {
        const passed = await this.executeStep(step);
        if (!passed) {
          this.transitionTo("locked", `Failed step: ${step}`);
          resolve(false);
          return;
        }
      }

      this.transitionTo("ready", "All pre-exam checks passed");
      resolve(true);
    });
  }

  private async executeStep(step: PreExamState): Promise<boolean> {
    const executor = this.stepExecutors[step];

    if (!executor) {
      // No executor registered — auto-pass (step is optional)
      this.stepResults.push({
        step,
        passed: true,
        detail: "no_executor_registered",
        durationMs: 0,
      });
      return true;
    }

    const retryKey = step;
    this.retries[retryKey] = 0;

    while (this.retries[retryKey] < MAX_RETRIES_PER_STEP) {
      this.retries[retryKey]++;
      this.transitionTo(step, `Attempt ${this.retries[retryKey]} of ${MAX_RETRIES_PER_STEP}`);

      try {
        const result = await executor();
        this.stepResults.push(result);

        if (result.passed) {
          return true;
        }

        // Failed — check if can retry
        if (this.retries[retryKey] >= MAX_RETRIES_PER_STEP) {
          this.transitionTo(step, `Failed after ${MAX_RETRIES_PER_STEP} attempts`);
          return false;
        }

        this.transitionTo(
          step,
          `Failed attempt ${this.retries[retryKey]}, retrying...`,
          true
        );
      } catch (err) {
        this.stepResults.push({
          step,
          passed: false,
          detail: `Error: ${err instanceof Error ? err.message : String(err)}`,
          durationMs: 0,
        });

        if (this.retries[retryKey] >= MAX_RETRIES_PER_STEP) {
          return false;
        }
      }
    }

    return false;
  }

  private transitionTo(state: PreExamState, detail: string, canRetry = false): void {
    this.state = state;
    this.callback({
      state,
      detail,
      canRetry,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get the current state.
   */
  getState(): PreExamState {
    return this.state;
  }

  /**
   * Get all step results.
   */
  getResults(): readonly StepResult[] {
    return this.stepResults;
  }

  /**
   * Check if the exam is ready to start.
   */
  isReady(): boolean {
    return this.state === "ready";
  }

  /**
   * Check if the state machine is locked (all retries exhausted).
   */
  isLocked(): boolean {
    return this.state === "locked";
  }

  /**
   * Reset the state machine to idle.
   */
  reset(): void {
    this.state = "idle";
    this.stepResults = [];
    this.retries = {};
  }
}
