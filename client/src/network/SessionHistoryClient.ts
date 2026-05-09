/**
 * SessionHistoryClient — Fetches prior session statistics for a student
 * and suggests threshold adjustments based on historical behavior.
 */

import type { ChannelWeightConfig, TierThresholdConfig } from "../coordinator/types";

/* ── Types matching server response ───────────────────────── */

export interface ChannelPrior {
  mean_score: number;
  max_score: number;
  std_dev: number;
  event_count: number;
}

export interface SessionHistoryPrior {
  student_id: string;
  total_sessions: number;
  total_events: number;
  mean_weighted_score: number;
  mean_agreement_index: number;
  tier1_rate: number;
  tier2_rate: number;
  channel_priors: Record<string, ChannelPrior>;
  suggested_threshold_adjustment: number;
}

export interface ThresholdAdjustment {
  weights: Partial<ChannelWeightConfig>;
  thresholds: Partial<TierThresholdConfig>;
}

/* ── Client ───────────────────────────────────────────────── */

export class SessionHistoryClient {
  private readonly baseUrl: string;

  constructor(baseUrl = "") {
    this.baseUrl = baseUrl;
  }

  /**
   * Fetch session-history prior for a student.
   * Returns null if the endpoint is unavailable or the student has no history.
   */
  async fetchPrior(studentId: string): Promise<SessionHistoryPrior | null> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/v1/session-history/${encodeURIComponent(studentId)}`
      );

      if (!response.ok) {
        if (response.status === 404) {
          return null; // No history for this student
        }
        return null;
      }

      return (await response.json()) as SessionHistoryPrior;
    } catch {
      // API unavailable — graceful degradation
      return null;
    }
  }

  /**
   * Compute threshold and weight adjustments from prior data.
   *
   * Strategy:
   * - If a channel historically has high variance (unreliable), reduce its weight.
   * - If the student historically triggers lots of Tier 1/2, raise thresholds
   *   slightly to reduce false positives (assuming genuine high-baseline behavior).
   * - If the student has very low historical scores, lower thresholds slightly
   *   so genuine anomalies are caught earlier.
   */
  computeAdjustments(prior: SessionHistoryPrior): ThresholdAdjustment {
    const weights: Partial<ChannelWeightConfig> = {};
    const thresholds: Partial<TierThresholdConfig> = {};

    // Adjust per-channel weights based on reliability (std_dev)
    const channels = ["pose_gaze", "rppg", "au", "keystroke"] as const;
    for (const ch of channels) {
      const chPrior = prior.channel_priors[ch];
      if (chPrior && chPrior.event_count > 10) {
        // High variance → reduce weight (channel is noisy for this student)
        if (chPrior.std_dev > 0.3) {
          weights[ch] = 0.15; // Reduced from default
        }
        // Very stable channel → slightly boost weight
        if (chPrior.std_dev < 0.05 && chPrior.event_count > 50) {
          weights[ch] = 0.30; // Boosted
        }
      }
    }

    // Adjust tier thresholds based on overall scoring history
    const adj = prior.suggested_threshold_adjustment;
    if (Math.abs(adj) > 0.01) {
      thresholds.tier1ScoreThreshold = 0.85 + adj;
      thresholds.tier2ScoreThreshold = 0.6 + adj;
      thresholds.tier2DisagreementScoreThreshold = 0.5 + adj;
    }

    return { weights, thresholds };
  }
}
