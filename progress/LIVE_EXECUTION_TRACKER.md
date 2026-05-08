# LIVE EXECUTION TRACKER

Last updated: 2026-05-08 (Asia/Calcutta)

This file is the single live status board for implementation.

## 1) Done

### Phase 0: Readiness and Dependency Gate (Completed)

- Conda + `proctor` environment verified.
- Docker services verified (`bezp-postgres`, `bezp-redis`).
- Backend/frontend baseline checks passed.

### Phase 1: Implemented and Verified

- Backend anomaly-score ingestion + PostgreSQL persistence.
- Redis session-summary cache with invalidation on writes.
- Signaling API skeleton:
  - `POST /api/v1/signaling`
  - `GET /api/v1/signaling/{session_id}/{target_id}/{signal_type}`
- Client signaling transport + WebRTC offer/ICE wiring.
- RTCDataChannel score transport with HTTP fallback.
- Local proctor loopback responder added to establish answer flow in local dev and enable DataChannel-open path validation.
- Remote ICE candidate ingestion added on the student signaling side.
- Worker evolved from synthetic placeholder to:
  - frame-driven scoring
  - MediaPipe Pose landmark-based scoring
  - automatic fallback path when pose inference is unavailable
- Real browser run completed with webcam permission.
- Observed runtime status: `Sent tier_3 (HTTP fallback)`.

## 2) Doing Now

- Manual verification run for explicit DataChannel state indicator (`DataChannel: open, sent=n`).

## 3) Remaining

- Re-run manual browser check to confirm `Sent ... (DataChannel)` status appears in UI with loopback responder.
- Move to post-Phase-1 tasks:
  - Alembic migrations
  - Redis-backed live session state/rate limiting

## 4) New Evidence Artifact

- `progress/phase1-integration-proof.json`
  - Contains timestamped POST + GET proof for `/api/v1/anomaly-scores` and `/api/v1/anomaly-scores/{session_id}`.
  - Confirms backend ingestion and summary retrieval path is operational.

- `client UI runtime indicator`
  - Added `DataChannel: ...` live state text in toolbar.
  - Increments send counter when payload is transmitted over DataChannel.

## 4) Exact Command Trace (Recent)

```powershell
Get-Content -Path client/src/network/WebRtcSignaling.ts
Get-Content -Path client/src/main.ts
Get-Content -Path client/tests/webrtc-signaling.test.ts
Get-Content -Path client/src/network/SignalingClient.ts
npm.cmd test
npm.cmd run build
conda run -n proctor python -m pytest
```
