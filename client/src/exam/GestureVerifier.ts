/**
 * GestureVerifier — Randomized Gesture Challenge/Response
 *
 * Presents a random sequence of head-movement challenges
 * (look left, right, up, down, nod) that cannot be passed from
 * a static image or pre-recorded loop. Uses nose-to-shoulder
 * displacement from PoseGazeWorker landmark data.
 *
 * Privacy: No images stored. Only pass/fail result and timing metadata.
 */

/* ── Types ────────────────────────────────────────────────── */

export type GestureDirection = "left" | "right" | "up" | "down" | "nod";

export interface GestureChallenge {
  direction: GestureDirection;
  timeoutMs: number;
}

export interface GestureResult {
  challenge: GestureChallenge;
  passed: boolean;
  detectedAt: number | null;
  responseTimeMs: number | null;
}

export interface GestureVerificationResult {
  passed: boolean;
  challenges: GestureResult[];
  totalTimeMs: number;
  attemptNumber: number;
}

export interface LandmarkSnapshot {
  nose: { x: number; y: number };
  leftShoulder: { x: number; y: number };
  rightShoulder: { x: number; y: number };
}

export type GestureVerifierCallback = (
  event:
    | { type: "challenge_start"; challenge: GestureChallenge; index: number; total: number }
    | { type: "challenge_pass"; challenge: GestureChallenge; responseTimeMs: number }
    | { type: "challenge_fail"; challenge: GestureChallenge }
    | { type: "verification_complete"; result: GestureVerificationResult }
) => void;

/* ── Configuration ────────────────────────────────────────── */

const ALL_DIRECTIONS: GestureDirection[] = ["left", "right", "up", "down", "nod"];
const CHALLENGE_COUNT = 3;
const CHALLENGE_TIMEOUT_MS = 5000;
const DISPLACEMENT_THRESHOLD = 0.08; // Normalized displacement to detect movement
const NOD_VERTICAL_THRESHOLD = 0.06;
const MAX_ATTEMPTS = 3;

/* ── Utilities ────────────────────────────────────────────── */

function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Generate a random sequence of gesture challenges.
 * Ensures no adjacent duplicates.
 */
export function generateChallenges(count: number = CHALLENGE_COUNT): GestureChallenge[] {
  const challenges: GestureChallenge[] = [];
  let lastDirection: GestureDirection | null = null;

  for (let i = 0; i < count; i++) {
    const available = ALL_DIRECTIONS.filter((d) => d !== lastDirection);
    const shuffled = shuffleArray(available);
    const direction = shuffled[0];
    lastDirection = direction;
    challenges.push({ direction, timeoutMs: CHALLENGE_TIMEOUT_MS });
  }

  return challenges;
}

/**
 * Detect if a gesture matches the expected direction based on
 * nose displacement relative to shoulder midpoint.
 *
 * Returns true if detected, false otherwise.
 */
export function detectGesture(
  direction: GestureDirection,
  baseline: LandmarkSnapshot,
  current: LandmarkSnapshot
): boolean {
  const baseShoulderMidX = (baseline.leftShoulder.x + baseline.rightShoulder.x) / 2;
  const baseShoulderMidY = (baseline.leftShoulder.y + baseline.rightShoulder.y) / 2;

  const curShoulderMidX = (current.leftShoulder.x + current.rightShoulder.x) / 2;
  const curShoulderMidY = (current.leftShoulder.y + current.rightShoulder.y) / 2;

  // Nose position relative to shoulder midpoint
  const baseNoseRelX = baseline.nose.x - baseShoulderMidX;
  const baseNoseRelY = baseline.nose.y - baseShoulderMidY;
  const curNoseRelX = current.nose.x - curShoulderMidX;
  const curNoseRelY = current.nose.y - curShoulderMidY;

  const deltaX = curNoseRelX - baseNoseRelX;
  const deltaY = curNoseRelY - baseNoseRelY;

  switch (direction) {
    case "left":
      return deltaX < -DISPLACEMENT_THRESHOLD;
    case "right":
      return deltaX > DISPLACEMENT_THRESHOLD;
    case "up":
      return deltaY < -NOD_VERTICAL_THRESHOLD;
    case "down":
      return deltaY > NOD_VERTICAL_THRESHOLD;
    case "nod":
      // Nod = vertical displacement exceeding threshold in either direction
      return Math.abs(deltaY) > NOD_VERTICAL_THRESHOLD;
    default:
      return false;
  }
}

/* ── GestureVerifier class ────────────────────────────────── */

export class GestureVerifier {
  private callback: GestureVerifierCallback;
  private challenges: GestureChallenge[] = [];
  private results: GestureResult[] = [];
  private currentIndex = 0;
  private baseline: LandmarkSnapshot | null = null;
  private challengeStartTime: number | null = null;
  private running = false;
  private attemptNumber = 0;
  private startTime = 0;
  private resolved = false;
  private timeoutId: ReturnType<typeof setTimeout> | undefined;

  constructor(callback: GestureVerifierCallback) {
    this.callback = callback;
  }

  /**
   * Start a verification sequence.
   * Returns a promise that resolves with the verification result.
   */
  async start(): Promise<GestureVerificationResult> {
    this.attemptNumber++;
    this.challenges = generateChallenges();
    this.results = [];
    this.currentIndex = 0;
    this.baseline = null;
    this.running = true;
    this.resolved = false;
    this.startTime = Date.now();

    return new Promise<GestureVerificationResult>((resolve) => {
      this._resolve = resolve;
      // Wait for first landmark to set baseline, then start first challenge
    });
  }

  private _resolve: ((result: GestureVerificationResult) => void) | null = null;

  /**
   * Feed a landmark snapshot from PoseGazeWorker.
   * Call this on every frame during verification.
   */
  feedLandmarks(snapshot: LandmarkSnapshot): void {
    if (!this.running || this.resolved) return;

    // First frame establishes baseline
    if (!this.baseline) {
      this.baseline = snapshot;
      this.beginNextChallenge();
      return;
    }

    // Check current challenge
    const challenge = this.challenges[this.currentIndex];
    if (!challenge) return;

    if (detectGesture(challenge.direction, this.baseline, snapshot)) {
      const responseTimeMs = Date.now() - (this.challengeStartTime ?? Date.now());

      this.results.push({
        challenge,
        passed: true,
        detectedAt: Date.now(),
        responseTimeMs,
      });

      this.callback({
        type: "challenge_pass",
        challenge,
        responseTimeMs,
      });

      // Reset baseline to current for next challenge
      this.baseline = snapshot;
      this.currentIndex++;

      if (this.currentIndex >= this.challenges.length) {
        this.complete(true);
      } else {
        this.beginNextChallenge();
      }
    }
  }

  private beginNextChallenge(): void {
    if (this.timeoutId !== undefined) {
      clearTimeout(this.timeoutId);
    }

    const challenge = this.challenges[this.currentIndex];
    this.challengeStartTime = Date.now();

    this.callback({
      type: "challenge_start",
      challenge,
      index: this.currentIndex,
      total: this.challenges.length,
    });

    this.timeoutId = setTimeout(() => {
      if (!this.running || this.resolved) return;

      this.results.push({
        challenge,
        passed: false,
        detectedAt: null,
        responseTimeMs: null,
      });

      this.callback({ type: "challenge_fail", challenge });
      this.complete(false);
    }, challenge.timeoutMs);
  }

  private complete(passed: boolean): void {
    if (this.resolved) return;

    this.running = false;
    this.resolved = true;

    if (this.timeoutId !== undefined) {
      clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
    }

    const result: GestureVerificationResult = {
      passed,
      challenges: this.results,
      totalTimeMs: Date.now() - this.startTime,
      attemptNumber: this.attemptNumber,
    };

    this.callback({
      type: "verification_complete",
      result,
    });

    this._resolve?.(result);
    this._resolve = null;
  }

  /**
   * Cancel the current verification.
   */
  cancel(): void {
    this.complete(false);
  }

  /**
   * Check if retries are available.
   */
  canRetry(): boolean {
    return this.attemptNumber < MAX_ATTEMPTS;
  }

  getAttemptNumber(): number {
    return this.attemptNumber;
  }

  getMaxAttempts(): number {
    return MAX_ATTEMPTS;
  }
}
