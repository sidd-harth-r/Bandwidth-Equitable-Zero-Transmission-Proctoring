# Export Schemas

This document defines the column schemas for CSV exports available in the proctor and administrator dashboards.

## 1. Session Anomaly Timeline
- **Format**: `session_{id}_timeline.csv`
- **Granularity**: One row per scored timestep (or downsampled).

| Column | Description |
| :--- | :--- |
| `session_id` | Unique identifier for the exam session. |
| `student_id_hashed` | SHA-256 hash of the student identifier. |
| `timestamp_utc` | ISO 8601 timestamp of the event. |
| `gear` | Network gear active at the time (gear_1 to gear_4). |
| `gaze_score` | Anomaly score from the Pose/Gaze worker (0.0 - 1.0). |
| `rppg_score` | Anomaly score from the rPPG worker (0.0 - 1.0). |
| `au_score` | Anomaly score from the Action Unit worker (0.0 - 1.0). |
| `keystroke_score` | Anomaly score from the Keystroke worker (0.0 - 1.0). |
| `fused_score` | Final weighted fusion score (0.0 - 1.0). |
| `agreement_index` | Channel agreement index (lower is better agreement). |
| `tier_classification` | Resulting tier (tier_1, tier_2, tier_3). |
| `alert_type` | Type of alert triggered (tier1/tier2/none). |
| `channels_active_count` | Number of active sensor channels at this timestep. |

## 2. Cohort Summary Report
- **Format**: `cohort_{exam_id}_summary.csv`
- **Granularity**: One row per student session.

| Column | Description |
| :--- | :--- |
| `session_id` | Unique identifier for the session. |
| `student_id_hashed` | SHA-256 hash of the student identifier. |
| `exam_id` | Unique identifier for the exam. |
| `session_start` | ISO 8601 start time. |
| `session_duration_minutes` | Total duration of the proctoring session. |
| `gear1_pct` | Percentage of time spent in Gear 1. |
| `gear2_pct` | Percentage of time spent in Gear 2. |
| `gear3_pct` | Percentage of time spent in Gear 3. |
| `gear4_pct` | Percentage of time spent in Gear 4. |
| `suspension_occurred` | Boolean indicating if Gear 4 suspension timer was triggered. |
| `tier1_alert_count` | Total count of Tier 1 alerts. |
| `tier2_alert_count` | Total count of Tier 2 alerts. |
| `clip_captured_count` | Number of video clips uploaded. |
| `proctor_decision` | Final decision if reviewed (suspicious / not_suspicious). |
| `final_trust_score` | Final calculated trust score (0.0 - 1.0). |
