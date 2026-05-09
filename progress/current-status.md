# Current Status

## 2026-05-09 (Phase 4 In Progress)

Phases 0–3 complete. Phase 4 human review pipeline started.

## Completed Phases

- **Phase 0**: Repository, docs, environment, Docker.
- **Phase 1**: Single-channel PoseGaze, backend ingestion, WebRTC DataChannel, PostgreSQL.
- **Phase 2**: Multi-channel detection (4 workers, Coordinator, FusionEngine, session-history priors, multi-channel UI).
- **Phase 3**: Pre-exam verification (GestureVerifier, RoomScanFlow, MultiScreenLogger, BackgroundMonitor, CalibrationSequence, PreExamStateMachine, MultiPersonDetector, PhoneDetector).

## Phase 4 — In Progress

- [x] `VideoRingBuffer` — RAM-only ring buffer with clip extraction.
- [x] `ClipUploader` — Binary encoding + HTTPS upload with retry.
- [x] `POST /api/v1/clips/{session_id}` — Server clip ingestion.
- [ ] Proctor dashboard (session list, review queue, timeline overlay, reviewer decisions).
- [ ] Verified labels for FL — reviewer decisions stored with 10× weighting.
- [ ] Neutral intervention message channel — server → client.

## Test Counts

- Client: **117 tests** across 11 test files.
- Backend: **15 tests**.
- Build: ✅ passes.

## Blocked

- Proctor dashboard requires separate frontend setup (React/Next.js).
- Real webcam/browser validation requires local browser testing.

## Next

- Proctor dashboard implementation.
- Reviewer decision storage and FL label pipeline.
