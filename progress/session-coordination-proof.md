# Session Coordination Proof

Generated: 2026-05-09 (Asia/Calcutta)

## Scope

This artifact records the verified backend behavior for Redis-backed session coordination after Phase 1 closure.

## Verified Behaviors

- `POST /api/v1/sessions/{session_id}/heartbeat` creates live Redis session state before any anomaly event exists.
- Heartbeat state records `status`, `current_gear`, `last_heartbeat_at`, and `heartbeat_count`.
- Heartbeats preserve latest anomaly fields after an anomaly score has been ingested.
- `GET /api/v1/sessions/{session_id}/state` returns merged live state and latest anomaly context.
- Redis rate limiting covers session heartbeat writes.

## Verification Command

```powershell
conda run -n proctor pytest -q
```

## Result

```text
15 passed
```

## Privacy Boundary

The coordination state stores derived operational metadata only. It does not store raw webcam frames, audio, keystrokes, or biometric media.
