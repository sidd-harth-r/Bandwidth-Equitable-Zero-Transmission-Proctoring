# BEZP Implementation Plan

## 1. Execution Principles

- Build one complete vertical slice before broadening the system.
- Keep raw biometric media local unless a Tier 2 clip is explicitly generated.
- Treat network degradation as a first-class feature, not a late optimization.
- Keep every detection claim measurable and documented.
- Add tests with each module, especially for fusion, gear transitions, and privacy boundaries.
- Record implementation decisions in progress notes and ADRs.

## 2. Environment Name

The local development environment is named `proctor`.

Use [../../environment.yml](../../environment.yml) as the base Conda environment. Keep language-specific dependencies in `client/package.json` and `server/pyproject.toml` as implementation begins.

## 3. Phase 0: Repository And Planning Foundation

### Goal

Prepare the repository so Phase 1 implementation can start without architecture ambiguity.

### Tasks In This Environment

- Create the documented directory structure.
- Add setup, testing, source-review, operations, decision, and progress documentation.
- Add `environment.yml` with the `proctor` environment.
- Add `.env.example` for local service configuration.
- Add dependency manifests for client and server scaffolding.
- Push the documentation foundation to GitHub.

### Tasks Outside This Environment

- Confirm GitHub access and branch protection settings.
- Decide whether future work should happen on `main` or feature branches.
- Install Conda or Mamba locally if not already available.
- Install Docker Desktop or Docker Engine.
- Install a Chromium-based browser for WebRTC, WebGL, MediaPipe, and IndexedDB testing.

### Acceptance Criteria

- Documentation exists and is linked from `README.md`.
- Planned directories are visible in Git.
- Setup instructions reference the `proctor` environment.
- Operations log records what changed, why, and how.

## 4. Phase 1: Foundation And Single-Channel Proof Of Concept

### Duration

3 to 4 weeks.

### Goal

Implement one complete end-to-end flow using pose/gaze as the first anomaly channel.

### Coding Tasks

- Initialize the TypeScript client build using Vite or Webpack with strict TypeScript.
- Define shared TypeScript message schemas for worker outputs, fusion inputs, gear state, tier events, and score payloads.
- Implement webcam permission flow and local video frame capture.
- Implement `PoseGazeWorker` with MediaPipe Pose.
- Implement first-pass gaze/head-orientation score with honest fallback when iris tracking is not ready.
- Implement `Coordinator`, `FusionEngine`, and `TierClassifier` in single-channel mode.
- Implement IndexedDB schema and `SessionStore`.
- Implement WebRTC signaling skeleton and unreliable DataChannel anomaly-score transmission.
- Implement FastAPI application factory.
- Implement `/signaling` and `/anomaly-scores` routes.
- Add PostgreSQL session and anomaly-event models.
- Add Redis client and basic session cache.
- Add Docker Compose for PostgreSQL, Redis, and backend.

### Testing Tasks

- Unit-test fusion output for single-channel input.
- Unit-test tier classification thresholds.
- Unit-test IndexedDB schema migrations in browser tests.
- Unit-test FastAPI anomaly-score schema validation.
- Integration-test browser score payload to FastAPI ingestion.
- Verify payload size is small and contains no frame data.
- Run a local 5-minute demo session and inspect database rows.

### Outside-Environment Tasks For You

- Provide test webcam access on a real machine.
- Confirm browser camera/microphone permission prompts.
- Create or confirm a GitHub project board for phase tasks.
- If using institutional auth later, request OAuth2 client details from the institution.

### Acceptance Criteria

- Browser shows an exam shell and captures local webcam frames.
- Pose/gaze worker emits scores.
- Coordinator writes session events to IndexedDB.
- Scores arrive at FastAPI over DataChannel path or the temporary Phase 1 fallback path.
- PostgreSQL contains session and anomaly-event records.
- No continuous video upload occurs.

## 5. Phase 2: Multi-Channel Detection

### Duration

4 to 5 weeks.

### Goal

Add rPPG, facial AU, keystroke, audio baseline features, and full two-stage fusion.

### Coding Tasks

- Implement `RppgWorker` with green-channel extraction from facial skin regions.
- Add FIR bandpass filtering between 0.75 Hz and 4 Hz.
- Add 2-minute resting rPPG baseline calibration.
- Implement `AuWorker` using Face Mesh landmarks for AU4, AU12, AU17, AU20, AU23, AU25, and AU26.
- Implement `KeystrokeWorker` for dwell time, flight time, variance, backspace rate, and paste ratio.
- Implement keystroke baseline capture using a 100-word paragraph.
- Implement `AudioAnalysisWorklet` for spectral features and voice-profile baseline.
- Implement channel normalization relative to each baseline.
- Implement full Channel Agreement Index and weighted mean fusion.
- Implement configurable channel weights and tier thresholds.
- Implement session-history prior fetch and threshold adjustment.

### Testing Tasks

- Unit-test each signal feature extractor with synthetic data.
- Test rPPG filter behavior with generated sine-wave inputs.
- Test keystroke feature extraction without storing key content.
- Test AU normalization against fixed landmark fixtures.
- Test fusion disagreement routing to Tier 2.
- Benchmark worker frame rates on at least low, mid, and high hardware profiles.

### Outside-Environment Tasks For You

- Collect controlled short test recordings or live sessions for legitimate behavior, gaze deviation, and typing patterns.
- Ensure consent from any participant used in testing.
- Record device specifications for benchmarking.

### Acceptance Criteria

- Four channel scores are produced independently.
- Fusion engine emits channel decomposition, agreement index, weighted score, and tier.
- Legitimate scratch-paper behavior is tested and tuned against false positives.
- Documentation records honest FPS floors and rPPG/AU limitations.

## 6. Phase 3: Pre-Exam Verification And Deterministic Rules

### Duration

2 to 3 weeks.

### Goal

Complete pre-exam verification and obvious violation detection independent of probabilistic fusion.

### Coding Tasks

- Implement randomized gesture verification sequence.
- Implement room scan workflow and background reference capture.
- Implement multi-screen context logging.
- Implement multi-person skeleton rule.
- Implement TensorFlow.js MobileNet or COCO-SSD phone detection at 10-second intervals.
- Implement background difference detection every 30 seconds.
- Integrate full calibration sequence: acoustic, rPPG, voice, keystroke, gear assignment.
- Add pre-exam state machine and failure/retry states.

### Testing Tasks

- Test each deterministic rule with controlled fixtures.
- Test gesture verification cannot pass from a static image.
- Test phone threshold against phone-like false positives.
- Test background threshold under lighting changes.
- Test calibration can fail safely and retry without corrupting baselines.

### Outside-Environment Tasks For You

- Perform physical room scan tests with real lighting variation.
- Test multi-monitor setups.
- Test phone-object detection with common false positives such as remotes and pens.

### Acceptance Criteria

- Pre-exam flow completes and unlocks exam only after required checks.
- Deterministic rules force Tier 1 when triggered.
- Calibration baselines are stored without recording prohibited raw content.

## 7. Phase 4: Human Review Pipeline

### Duration

3 weeks.

### Goal

Implement Tier 2 clip handling, proctor dashboard, and verified decision feedback.

### Coding Tasks

- Maintain RAM-only rolling video buffer.
- Extract 30-second clips around Tier 2 events.
- Encode clips at bounded quality and upload via HTTPS.
- Add FastAPI clip ingestion and metadata storage.
- Build proctor dashboard session list and review queue.
- Add anomaly timeline overlay and channel decomposition view.
- Add reviewer decisions: suspicious, not suspicious, escalate.
- Store verified labels for FL with 10x weighting metadata.
- Implement neutral intervention message channel.

### Testing Tasks

- Verify clip buffer is never written to IndexedDB.
- Test clip upload retry and failure handling.
- Test dashboard queue ordering.
- Test reviewer decision audit trail.
- Test random review selection at configurable rates.

### Outside-Environment Tasks For You

- Define reviewer roles and institutional escalation policy.
- Provide sample review rubric.
- Confirm retention policy for Tier 2 clips.

### Acceptance Criteria

- Tier 2 events create reviewable clips.
- Proctor can review, decide, and save labels.
- Decisions are available to the FL training pipeline.

## 8. Phase 5: Federated Learning Pipeline

### Duration

4 to 5 weeks.

### Goal

Complete local post-exam training, gradient transmission, server aggregation, validation, and model redistribution.

### Coding Tasks

- Implement 2-layer LSTM architecture with 64 units per layer.
- Implement frozen inference model loading and version cache.
- Implement post-exam local training for 5 epochs.
- Implement gradient delta computation.
- Implement sparsification for deltas above threshold.
- Implement 8-bit quantization for Gear 3 and Gear 4.
- Implement L2 clipping and Gaussian DP noise.
- Implement gradient serialization and HTTPS upload.
- Implement `FlowerBrowserClientAdapter`.
- Implement tiered aggregation strategy.
- Implement synthetic validation gate.
- Implement model versioning and broadcast.
- Implement hash-chain trigger for audit records.

### Testing Tasks

- Unit-test compression/decompression reversibility within tolerance.
- Unit-test DP clipping and noise calibration.
- Unit-test gradient schema validation.
- Run aggregation test with at least 5 simulated clients.
- Reject a model update that degrades validation accuracy by more than 2 percent.
- Test service worker model cache update.

### Outside-Environment Tasks For You

- Identify public datasets suitable for cold-start pretraining.
- Confirm whether synthetic-only validation is acceptable for academic demo.
- Obtain GPU access if pretraining is too slow locally.

### Acceptance Criteria

- A completed exam can produce a local update.
- Server can aggregate multiple updates.
- Accepted model versions are stored and distributed.
- Rejected model versions leave the previous model active.

## 9. Phase 6: Network Resilience And 4-Gear System

### Duration

2 to 3 weeks.

### Goal

Implement and validate network-adaptive behavior under realistic poor-connectivity conditions.

### Coding Tasks

- Implement gear state machine with hysteresis.
- Integrate WebRTC `getStats()` telemetry.
- Update worker settings by gear.
- Implement Service Worker offline queue.
- Implement critical-alert-only behavior in Gear 4.
- Implement 5-minute Gear 4 suspension.
- Implement dashboard cached-score display for degraded states.

### Testing Tasks

- Test all gear transition boundaries.
- Use Linux `tc` or equivalent tooling for RTT and packet-loss scenarios.
- Run S1 through S9 network scenarios from the testing strategy.
- Capture packets to verify no continuous video upload.
- Confirm queued gradients sync after connectivity recovery.

### Outside-Environment Tasks For You

- Run network shaping on Linux or WSL with admin privileges.
- Install Wireshark and capture a full test session.
- Save packet-capture summaries, not raw private captures, into test reports.

### Acceptance Criteria

- Gear behavior matches documented thresholds.
- Exam remains stable across degraded states.
- Gear 4 suspends after configured limit.
- Packet analysis supports the zero-continuous-video claim.

## 10. Phase 7: Validation, Security, And Documentation Freeze

### Duration

3 weeks.

### Goal

Validate empirical claims, harden security, and prepare final project submission materials.

### Coding Tasks

- Complete missing edge-case handling.
- Add audit chain validation tooling.
- Add rate-limit bypass tests.
- Add model rollback controls.
- Add final dashboard/report exports.
- Freeze APIs and schemas for project submission.

### Testing Tasks

- Measure false positive rate on legitimate exam behavior.
- Measure detection precision on simulated cheating scenarios.
- Validate rPPG signal quality across lighting and device types.
- Validate baseline poisoning mitigation.
- Validate hash-chain tampering detection.
- Run performance profiling across all gears.
- Run final accessibility and privacy disclosure review.

### Outside-Environment Tasks For You

- Prepare final demo script.
- Prepare academic report screenshots and diagrams.
- Conduct supervised validation sessions.
- Collect reviewer feedback.
- Confirm final presentation and submission format.

### Acceptance Criteria

- False positive target below 5 percent is evaluated.
- Simulated cheating precision target above 90 percent is evaluated.
- Bandwidth and privacy claims are backed by logs or packet summaries.
- Documentation and operations log are current.

## 11. Definition Of Done For Every Module

Each module is complete only when:

- It has a documented purpose and privacy boundary.
- It has typed input and output schemas.
- It has unit tests.
- It has integration coverage if it crosses process, worker, network, or storage boundaries.
- It updates the relevant architecture docs.
- It records notable implementation decisions in progress notes or ADRs.
- It avoids storing or transmitting raw biometric data unless explicitly required by Tier 2 policy.

## 12. Immediate Next Coding Backlog

1. Select client bundler and create strict TypeScript baseline.
2. Add FastAPI app factory and health endpoint.
3. Add Docker Compose for PostgreSQL and Redis.
4. Define shared event and score schemas.
5. Implement first IndexedDB store.
6. Build pose/gaze worker proof of concept.
7. Connect score emission to backend ingestion.
8. Add first integration test from browser client to backend.
