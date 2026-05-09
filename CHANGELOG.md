# Changelog

All notable project changes are recorded here. Every future implementation PR should add an entry with date, what changed, why it changed, and any replacement or migration details.

## 2026-05-09 — Phase 4: Human Review Pipeline (partial)

### Added

- Implemented `VideoRingBuffer` — RAM-only ring buffer with configurable capacity, cyclic overwrite, memory tracking, and clip extraction by time window.
- Implemented `ClipUploader` — binary clip encoding (JSON header + raw pixels) with HTTPS upload, 3 retries, exponential backoff, and cancellation support.
- Added server `POST /api/v1/clips/{session_id}` endpoint with 50MB size limit, rate limiting, and local filesystem storage.
- Added 12 tests for ring buffer operations and 3 tests for clip encoding.

### Verified

- Client: 117 tests pass across 11 test files.
- Client: Build passes.
- Backend: 15 tests pass.

## 2026-05-09 — Phase 3: Pre-Exam Verification (complete)

### Added (since previous entry)

- Implemented `MultiPersonDetector` — skin-region clustering heuristic detecting multiple separated skin-colored regions in frame. Greedy cluster merging with configurable merge distance.
- Implemented `PhoneDetector` — TensorFlow.js COCO-SSD dynamic import with edge-density heuristic fallback for phone-shaped rectangular regions. Configurable confidence threshold and `heuristicOnly` mode for testing.
- Added 14 tests for deterministic rules (multi-person + phone detection).

## 2026-05-09 — Phase 3: Pre-Exam Verification (partial)

### Added

- Implemented `GestureVerifier` with randomized 3-gesture challenge/response sequence (left/right/up/down/nod) using nose-to-shoulder displacement detection. Cannot pass from static image.
- Implemented `RoomScanFlow` with 300° rotation detection via frame-to-frame horizontal motion estimation. Captures background reference frame in RAM only.
- Implemented `MultiScreenLogger` with Screen Details API (Chrome 100+) and window.screen fallback. Logs count/dimensions, not content.
- Implemented `BackgroundMonitor` with configurable 30-second periodic frame comparison against a reference. Triggers alert at >25% pixel change.
- Implemented `CalibrationSequence` orchestrating acoustic (5s), rPPG (2min), voice (10s), keystroke (200-key) baselines plus gear assignment via API RTT.
- Implemented `PreExamStateMachine` with states: idle → screen_check → gesture_verification → room_scan → calibration → ready → locked. Supports 3 retries per step.
- Added `docs/implementation/CHANNEL_PERFORMANCE.md` documenting honest FPS floors, per-channel limitations, and fusion constraints.
- Added 26 new tests across 2 test files: `gesture-verifier.test.ts` (10 tests), `pre-exam.test.ts` (16 tests).

### Verified

- Client: 91 tests pass across 9 test files.
- Client: Build passes with all workers bundled.
- Backend: 15 tests pass (no backend changes).

## 2026-05-09 — Phase 2: Multi-Channel UI & Session History

### Added

- Rewrote `main.ts` to use Coordinator for multi-channel orchestration.
- Added multi-channel UI: per-channel score cards with animated bars, fusion panel, calibration status, keystroke textarea, audio capture.
- Created `SessionHistoryClient` with `fetchPrior()` and `computeAdjustments()` for personalized threshold tuning.
- Added server endpoint `GET /api/v1/session-history/{student_id}` with per-channel priors and suggested threshold adjustment.
- Added `student_prior()` method to `SqlAnomalyStore`.

## 2026-05-09 — Phase 2: Multi-Channel Detection Workers

### Added

- Implemented `RppgWorker` with green-channel extraction, 32-order FIR bandpass filter (0.75–4 Hz), zero-crossing heart-rate estimation, autocorrelation signal quality, and 2-minute baseline calibration.
- Implemented `AuWorker` with AU4/AU12/AU17/AU20/AU23/AU25/AU26 detection from Face Mesh landmarks (with frame-pixel fallback), weighted anomaly scoring, and 30-frame baseline calibration.
- Implemented `KeystrokeWorker` with dwell time, flight time, backspace rate, paste ratio tracking, 200-keystroke baseline calibration, and privacy-preserving design (no key content stored).
- Implemented `AudioAnalysisWorklet` with FFT-based spectral feature extraction, voice activity detection, speech-band energy analysis, and 50-frame baseline calibration.
- Created `Coordinator` class to orchestrate all four workers plus `AudioAnalyser`, with frame distribution, keyboard event forwarding, and unified fusion score emission.
- Extended shared types in `coordinator/types.ts` with `RppgScoreMessage`, `AuScoreMessage`, `KeystrokeScoreMessage`, `AudioScoreMessage`, `ChannelWeightConfig`, `TierThresholdConfig`, and a unified `ChannelScoreMessage` union type.
- Added default channel weights: pose_gaze=0.35, rppg=0.20, au=0.25, keystroke=0.20.
- Added default tier thresholds with configurable Tier 1/Tier 2/Tier 3 classification boundaries.
- Extracted pure computation functions into `rppg-utils.ts`, `au-utils.ts`, `keystroke-utils.ts` for testability outside Web Worker context.
- Added 4 new test files: `rppg-worker.test.ts` (20 tests), `au-worker.test.ts` (9 tests), `keystroke-worker.test.ts` (12 tests), `audio-worklet.test.ts` (8 tests).
- Updated `fusion.test.ts` with multi-channel weight tests, tier classification tests, and runtime update tests (10 tests total).

### Changed

- `FusionEngine` now uses configurable `ChannelWeightConfig` with `DEFAULT_CHANNEL_WEIGHTS` instead of hardcoded single-channel weight.
- `TierClassifier` now uses configurable `TierThresholdConfig` with `DEFAULT_TIER_THRESHOLDS` and supports runtime threshold updates.
- Both `FusionEngine` and `TierClassifier` support `updateWeights()` / `updateThresholds()` for runtime reconfiguration.

### Verified

- Client: 65 tests pass across 7 test files.
- Client: `npm.cmd run build` passes (tsc + vite build).
- No regressions in existing WebRTC signaling or fusion tests.


## 2026-05-08

### Added

- Started Phase 1 implementation with a FastAPI backend package, health endpoint, anomaly-score ingestion endpoint, in-memory score store, and backend tests.
- Added a Vite/TypeScript client shell with a pose/gaze placeholder Web Worker, fusion engine, tier classifier, IndexedDB session store, anomaly-score API client, and client tests.
- Added generated `client/package-lock.json` after installing client dependencies.
- Created and verified the real Conda environment named `proctor`.
- Started Docker Compose PostgreSQL/TimescaleDB and Redis development services.
- Added SQLAlchemy database wiring and PostgreSQL persistence for anomaly-score events.

### Changed

- Replaced the temporary MSYS Python fallback dependency plan with the Conda-backed Pydantic v2, SQLAlchemy, Redis, Flower, NumPy, and SciPy setup.
- Replaced the backend anomaly-score route's process-local in-memory store with a request-scoped SQLAlchemy store.
- Updated FastAPI startup initialization to use a lifespan handler.

### Verified

- Docker Engine `29.4.2`, Docker Compose `v5.1.3`, PostgreSQL `15.17`, TimescaleDB extension `2.26.4`, and Redis connectivity were verified.
- `server`: `conda run -n proctor python -m pytest` passed.
- `client`: `npm.cmd test` passed.
- `client`: `npm.cmd run build` passed.
- `proctor`: `conda run -n proctor python -m pip check` passed.
- `client`: `npm.cmd audit --audit-level=moderate` reported 0 vulnerabilities.

### Dependency Notes

- Use `C:\Users\siddh\anaconda3\Scripts\conda.exe` directly in shells where Conda is not on `PATH`.
- The repository still ignores the earlier local fallback `proctor` virtual environment; implementation should use the verified Conda environment.

## 2026-05-08 Foundation

### Added

- Created the BEZP implementation documentation set from the uploaded technical specification, synopsis, and presentation.
- Added the planned repository structure for client, server, proctor dashboard, ML, infrastructure, tests, and progress tracking.
- Added `environment.yml` using the required Conda environment name `proctor`.
- Added setup, testing, source-review, architecture, implementation, decision, and operations documentation.

### Changed

- Expanded the root `README.md` from a title-only placeholder into a contributor-oriented project entry point.

### Why

- The project needs a concrete, implementation-ready plan before Phase 1 coding begins.
- The specification describes a multi-phase, privacy-sensitive system where unmanaged assumptions would become expensive later.

### How

- Extracted requirements from the uploaded documents.
- Mapped requirements into architecture, phases, tasks, test categories, environment setup, and repository directories.
- Created tracked placeholder files so the planned directory structure is visible in Git.
