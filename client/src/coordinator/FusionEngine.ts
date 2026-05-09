import type {
  ChannelScores,
  ChannelWeightConfig,
  FusionResult,
} from "./types";
import { DEFAULT_CHANNEL_WEIGHTS } from "./types";

const CHANNEL_KEYS: Array<keyof ChannelScores> = [
  "pose_gaze",
  "rppg",
  "au",
  "keystroke"
];

export class FusionEngine {
  private readonly weights: ChannelWeightConfig;

  constructor(weights?: Partial<ChannelWeightConfig>) {
    this.weights = {
      ...DEFAULT_CHANNEL_WEIGHTS,
      ...weights,
    };
  }

  /**
   * Update channel weights at runtime (e.g. from config push or
   * when a channel reports degraded quality).
   */
  updateWeights(patch: Partial<ChannelWeightConfig>): void {
    Object.assign(this.weights, patch);
  }

  getWeights(): Readonly<ChannelWeightConfig> {
    return { ...this.weights };
  }

  private activeChannels: Record<string, boolean> = {
    pose_gaze: true,
    rppg: true,
    au: true,
    keystroke: true
  };

  /**
   * Update active channels (e.g. from gear transition).
   */
  updateActiveChannels(active: Record<string, boolean>): void {
    Object.assign(this.activeChannels, active);
  }

  fuse(channelScores: ChannelScores): FusionResult {
    const activeKeys = CHANNEL_KEYS.filter(key => this.activeChannels[key] !== false);
    const numActive = activeKeys.length || 1;

    const scores = activeKeys.map((key) => clamp01(channelScores[key]));
    const mean = scores.reduce((sum, score) => sum + score, 0) / numActive;
    
    // Variance computation: stddev of 2 is less informative, but we compute it normally
    const variance =
      scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / numActive;

    // Channel Agreement Index — lower variance = higher agreement
    const agreementIndex = Math.min(0.5, Math.sqrt(variance));

    // Weighted score using configured weights
    const totalWeight = activeKeys.reduce((sum, key) => sum + this.weights[key], 0) || 1;
    const weightedScore =
      activeKeys.reduce(
        (sum, key) => sum + clamp01(channelScores[key]) * this.weights[key],
        0
      ) / totalWeight;

    return {
      channel_scores: {
        pose_gaze: clamp01(channelScores.pose_gaze),
        rppg: clamp01(channelScores.rppg),
        au: clamp01(channelScores.au),
        keystroke: clamp01(channelScores.keystroke)
      },
      agreement_index: round(agreementIndex),
      weighted_score: round(weightedScore)
    };
  }
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
