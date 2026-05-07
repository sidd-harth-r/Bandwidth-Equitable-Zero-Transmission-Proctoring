import type { ChannelScores, FusionResult } from "./types";

const CHANNEL_KEYS: Array<keyof ChannelScores> = [
  "pose_gaze",
  "rppg",
  "au",
  "keystroke"
];

export class FusionEngine {
  private readonly weights: ChannelScores;

  constructor(weights: ChannelScores = { pose_gaze: 1, rppg: 0, au: 0, keystroke: 0 }) {
    this.weights = weights;
  }

  fuse(channelScores: ChannelScores): FusionResult {
    const scores = CHANNEL_KEYS.map((key) => clamp01(channelScores[key]));
    const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const variance =
      scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
    const agreementIndex = Math.min(0.5, Math.sqrt(variance));
    const totalWeight = CHANNEL_KEYS.reduce((sum, key) => sum + this.weights[key], 0) || 1;
    const weightedScore =
      CHANNEL_KEYS.reduce(
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
