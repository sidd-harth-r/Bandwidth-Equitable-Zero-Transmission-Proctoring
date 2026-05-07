# Sprint 001 Decisions Made

- Use `proctor` as the local environment name.
- Keep documentation, progress tracking, and ADRs in Git from the start.
- Begin implementation with pose/gaze as the first end-to-end channel.
- Use an HTTP anomaly-score POST fallback for the first client/server slice, then replace it with WebRTC DataChannel transmission in the next step.
- Keep Phase 1 anomaly events in memory until PostgreSQL can run through Docker or a standard Python environment.
- Move native database and ML packages to optional backend extras so Phase 1 remains runnable in this workspace.
