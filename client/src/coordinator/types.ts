export type Gear = "gear_1" | "gear_2" | "gear_3" | "gear_4";
export type Tier = "tier_1" | "tier_2" | "tier_3";

export interface ChannelScores {
  pose_gaze: number;
  rppg: number;
  au: number;
  keystroke: number;
}

/* ── Pose / Gaze ─────────────────────────────────────────────── */

export interface WorkerScoreMessage {
  type: "pose_gaze_score";
  score: number;
  reason: string;
  sampledAt: string;
  datapoints?: {
    centerX: number;
    centerY: number;
    motion: number;
    brightness: number;
    brightnessShift: number;
  };
  landmarks?: {
    nose: { x: number; y: number };
    leftShoulder: { x: number; y: number };
    rightShoulder: { x: number; y: number };
  };
}

/* ── rPPG ────────────────────────────────────────────────────── */

export interface RppgScoreMessage {
  type: "rppg_score";
  score: number;
  reason: string;
  sampledAt: string;
  heartRateEstimate: number | null;
  signalQuality: number;
  isCalibrating: boolean;
}

export type RppgWorkerInput =
  | { type: "start" }
  | { type: "stop" }
  | { type: "frame"; width: number; height: number; pixels: Uint8ClampedArray }
  | { type: "set_baseline"; baselineHr: number; baselineVariance: number };

/* ── Action Units ────────────────────────────────────────────── */

export interface AuActivation {
  au4: number;   // Brow lowerer
  au12: number;  // Lip corner puller
  au17: number;  // Chin raiser
  au20: number;  // Lip stretcher
  au23: number;  // Lip tightener
  au25: number;  // Lips part
  au26: number;  // Jaw drop
}

export interface AuScoreMessage {
  type: "au_score";
  score: number;
  reason: string;
  sampledAt: string;
  activations: AuActivation;
  isCalibrating: boolean;
}

export type AuWorkerInput =
  | { type: "start" }
  | { type: "stop" }
  | { type: "frame"; width: number; height: number; pixels: Uint8ClampedArray }
  | { type: "set_baseline"; baseline: AuActivation };

/* ── Keystroke ────────────────────────────────────────────────── */

export interface KeystrokeFeatures {
  dwellMean: number;
  dwellVariance: number;
  flightMean: number;
  flightVariance: number;
  backspaceRate: number;
  pasteRatio: number;
}

export interface KeystrokeScoreMessage {
  type: "keystroke_score";
  score: number;
  reason: string;
  sampledAt: string;
  features: KeystrokeFeatures;
  isCalibrating: boolean;
}

export type KeystrokeWorkerInput =
  | { type: "start" }
  | { type: "stop" }
  | { type: "keydown"; key: string; timestamp: number }
  | { type: "keyup"; key: string; timestamp: number }
  | { type: "paste"; timestamp: number; length: number }
  | { type: "set_baseline"; baseline: KeystrokeFeatures }
  | { type: "flush" };

/* ── Audio ────────────────────────────────────────────────────── */

export interface AudioScoreMessage {
  type: "audio_score";
  score: number;
  reason: string;
  sampledAt: string;
  spectralEnergy: number;
  voicePresent: boolean;
  isCalibrating: boolean;
}

/* ── Unified multi-channel message ────────────────────────────── */

export type ChannelScoreMessage =
  | WorkerScoreMessage
  | RppgScoreMessage
  | AuScoreMessage
  | KeystrokeScoreMessage
  | AudioScoreMessage;

/* ── Fusion ───────────────────────────────────────────────────── */

export interface FusionResult {
  channel_scores: ChannelScores;
  agreement_index: number;
  weighted_score: number;
}

export interface AnomalyScorePayload extends FusionResult {
  session_id: string;
  student_id: string;
  occurred_at: string;
  tier: Tier;
  gear: Gear;
  metadata: Record<string, string>;
}

/* ── Channel weight config ────────────────────────────────────── */

export interface ChannelWeightConfig {
  pose_gaze: number;
  rppg: number;
  au: number;
  keystroke: number;
}

export const DEFAULT_CHANNEL_WEIGHTS: ChannelWeightConfig = {
  pose_gaze: 0.35,
  rppg: 0.20,
  au: 0.25,
  keystroke: 0.20,
};

/* ── Tier threshold config ────────────────────────────────────── */

export interface TierThresholdConfig {
  tier1ScoreThreshold: number;
  tier1AgreementCeiling: number;
  tier2ScoreThreshold: number;
  tier2DisagreementFloor: number;
  tier2DisagreementScoreThreshold: number;
}

export const DEFAULT_TIER_THRESHOLDS: TierThresholdConfig = {
  tier1ScoreThreshold: 0.85,
  tier1AgreementCeiling: 0.15,
  tier2ScoreThreshold: 0.6,
  tier2DisagreementFloor: 0.25,
  tier2DisagreementScoreThreshold: 0.5,
};
