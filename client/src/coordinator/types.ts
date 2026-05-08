export type Gear = "gear_1" | "gear_2" | "gear_3" | "gear_4";
export type Tier = "tier_1" | "tier_2" | "tier_3";

export interface ChannelScores {
  pose_gaze: number;
  rppg: number;
  au: number;
  keystroke: number;
}

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
