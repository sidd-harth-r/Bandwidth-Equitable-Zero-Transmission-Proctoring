# Operations Log

This document records what changed, why it changed, and how it was performed. Continue updating it during every future implementation phase.

## 2026-05-08: Documentation And Structure Foundation

### Operation 1: Repository Inspection

- What changed: no files changed.
- Why: establish the initial repository state before editing.
- How: inspected the workspace, Git status, Git remote, and existing files.
- Result: repository contained `.git`, `README.md`, and GitHub remote `origin`.

### Operation 2: Source Document Discovery

- What changed: no project files changed.
- Why: identify uploaded documentation and methodology files.
- How: listed the parent project folder.
- Result: found the technical specification, EL synopsis, EL presentation, and a project PDF.

### Operation 3: Source Extraction For Review

- What changed: temporary extraction files were created under `.codex_tmp/source_extracts`.
- Why: read Word and PowerPoint source text without modifying the original uploaded files.
- How: used local PowerShell OpenXML extraction for `.docx` and `.pptx`; attempted local PDF extraction with standard Python libraries.
- Result: technical specification, synopsis, and presentation text were readable. The PDF extraction produced mostly font artifacts, so it was not used as an authoritative source.

### Operation 4: README Encoding Normalization

- What changed: converted `README.md` from UTF-16 LE to UTF-8 before editing.
- Why: the patch tool and GitHub-friendly Markdown workflows expect UTF-8 text.
- How: read the existing README as Unicode and rewrote the same content as UTF-8 before applying documentation edits.
- Result: README could be edited and rendered normally.

### Operation 5: Directory Structure Creation

- What changed: created the planned top-level and nested directories for documentation, client, server, dashboard, infrastructure, ML, tests, scripts, configs, and progress tracking; added `.gitkeep` placeholders to empty directories so Git can track the structure.
- Why: make the implementation phases visible and keep future code in predictable ownership areas.
- How: created directories with PowerShell inside the repository workspace, then generated placeholders only where directories had no tracked file.
- Result: repository now matches the planned BEZP implementation layout.

### Operation 6: Documentation Creation

- What changed: added project documentation, repository structure documentation, implementation plan, environment setup, testing strategy, source review, operations log, changelog, decision index, ADR, and progress files.
- Why: convert the uploaded methodology and technical specification into implementation-ready project documents.
- How: added Markdown files using patch-based edits.
- Result: next phases can start from documented tasks, acceptance criteria, and setup instructions.

### Operation 7: Environment And Config Scaffolding

- What changed: added `environment.yml`, `.env.example`, `.gitignore`, `.gitattributes`, client package manifest, server project manifest, and Docker Compose development scaffold.
- Why: define the `proctor` environment and expected local development services.
- How: added config files using patch-based edits.
- Result: future implementation can install dependencies and bring up services from documented locations.

### Operation 8: Git Push

- What changed: staged, committed, and pushed the documentation/scaffold changes to GitHub.
- Why: user requested that all changes made in this environment be pushed to GitHub.
- How: ran `git add`, committed with message `docs: scaffold BEZP implementation plan`, and pushed `main` to the configured `origin` remote.
- Result: commit `9bf2942` was pushed to `origin/main`.

### Operation 9: Temporary Artifact Cleanup

- What changed: removed `.codex_tmp/source_extracts` from the workspace.
- Why: the extracted source text was only needed while preparing documentation and should not remain in the project tree.
- How: resolved the absolute path, verified it was inside the repository workspace, then recursively removed the generated temporary directory.
- Result: source documents remain unchanged outside the repo; temporary extraction artifacts are gone.

### Operation 10: Verification

- What changed: no project content changed except this log entry.
- Why: confirm the scaffold is syntactically sane before committing.
- How: listed tracked candidate files, checked Git status, parsed `client/package.json`, parsed `server/pyproject.toml`, ran `git diff --check`, and scanned repository text for non-ASCII characters.
- Result: JSON and TOML parsed successfully; whitespace check passed; non-ASCII scan returned no matches.

### Operation 11: Operations Log Correction

- What changed: updated Operation 8 after the GitHub push succeeded.
- Why: keep the operations log aligned with the actual repository state.
- How: edited this log entry with the pushed commit and remote branch result.
- Result: this correction is prepared as a follow-up commit and push.

## 2026-05-08: Phase 1 Implementation Start

### Operation 12: Dependency Check

- What changed: no repository content changed.
- Why: identify what could be installed and run locally before implementation.
- How: checked Git status, Python, Node, npm, Docker, Conda, and Python package imports.
- Result: Git was clean; Python and Node were available; npm required `npm.cmd`; Docker and Conda were missing; backend Python packages were not installed.

### Operation 13: Dependency Installation

- What changed: created local ignored `proctor` virtual environment, installed client dependencies, generated `client/package-lock.json`, and installed Phase 1 backend dependencies.
- Why: user requested dependency checks and installation before implementation.
- How: used `npm.cmd install` in `client`; bootstrapped pip from Python's bundled wheel because `ensurepip` hit temp-directory permission errors; installed `server[dev]` with Phase 1-compatible dependency pins.
- Result: client dependencies installed; backend editable package installed; `pip check` passed after dependency pins were updated.

### Operation 14: Dependency Constraints Found

- What changed: updated backend dependency groups to separate Phase 1 runtime from later database/ML dependencies.
- Why: the local MSYS Python environment could not build native packages required by SQLAlchemy greenlet, NumPy, SciPy, or Flower.
- How: pinned FastAPI/Pydantic/httpx to compatible Phase 1 versions and moved database/ML packages into optional `database` and `ml` extras.
- Result: Phase 1 backend tests can run locally; database and FL installation remain for a Conda/Docker/standard CPython setup.

### Operation 15: Backend Phase 1 Slice

- What changed: added `bezp_server` FastAPI package with app factory, CORS, health endpoint, anomaly-score ingestion route, Pydantic schemas, in-memory anomaly store, and tests.
- Why: establish the first server-side path for derived anomaly scores before adding PostgreSQL and WebRTC.
- How: implemented route modules under `server/src/bezp_server` and pytest coverage under `server/tests`.
- Result: backend accepts score payloads, validates score ranges, and returns per-session summaries.

### Operation 16: Client Phase 1 Slice

- What changed: added Vite/TypeScript client app, fusion engine, tier classifier, shared score types, IndexedDB session store, anomaly-score HTTP client, pose/gaze placeholder worker, styles, and Vitest coverage.
- Why: start the browser side of the first end-to-end anomaly-score flow while MediaPipe/WebRTC are still pending.
- How: implemented a simple UI that starts a worker, creates derived pose/gaze placeholder scores, stores them locally, classifies tier, and posts to the backend fallback endpoint.
- Result: client tests pass and production build succeeds.

### Operation 17: Dependency Audit Fix

- What changed: upgraded Vite, Vitest, and TypeScript dev dependencies and added Vite client type references.
- Why: initial `npm audit --audit-level=moderate` reported 5 moderate findings through Vite/esbuild/Vitest transitive dependencies.
- How: upgraded dev dependencies with npm, switched Vite config typing to `vitest/config`, and added `vite-env.d.ts` for CSS module side-effect imports.
- Result: `npm audit --audit-level=moderate` reports 0 vulnerabilities.

### Operation 18: Validation

- What changed: no project content changed after the final validation commands.
- Why: verify the implementation slice works before committing.
- How: ran backend pytest, client Vitest, client production build, `pip check`, dependency version checks, and npm audit.
- Result: backend tests passed; client tests passed; client build passed; `pip check` passed; npm audit passed after the dev dependency upgrade.

## 2026-05-08: Conda And Docker Dependency Completion

### Operation 19: Docker Verification

- What changed: no repository content changed.
- Why: confirm Docker is usable before enabling database-backed implementation.
- How: checked Docker Engine, Docker Compose, daemon connectivity, and running Compose service status.
- Result: Docker Engine `29.4.2` and Docker Compose `v5.1.3` are available.

### Operation 20: Conda Environment Creation

- What changed: created the local Conda environment named `proctor` outside the repository.
- Why: the earlier MSYS Python fallback could not support the native database, ML, and FL dependency stack.
- How: used the installed Conda executable at `C:\Users\siddh\anaconda3\Scripts\conda.exe` to create the environment from `environment.yml`.
- Result: `proctor` now contains Python 3.11, Node.js 20, FastAPI, Pydantic v2, SQLAlchemy, Alembic, psycopg, Redis, Flower, NumPy, SciPy, pytest, and HTTPX.

### Operation 21: Backend Dependency Alignment

- What changed: updated `server/pyproject.toml`, server settings, and Pydantic validators for the full Conda-backed dependency set.
- Why: restore the intended backend dependency stack now that Conda is available.
- How: added full runtime dependencies, switched settings to `pydantic-settings`, replaced deprecated Pydantic v1 validation calls, and installed `server[dev]` editable into `proctor`.
- Result: `conda run -n proctor python -m pip check` reports no broken requirements.

### Operation 22: Development Services Startup

- What changed: started Docker Compose PostgreSQL/TimescaleDB and Redis containers.
- Why: database-backed anomaly-score persistence requires local services.
- How: ran `docker compose -f infrastructure/docker/docker-compose.dev.yml up -d`, verified the containers, checked PostgreSQL and Redis connections from the `proctor` environment, and enabled the TimescaleDB extension.
- Result: PostgreSQL `15.17`, TimescaleDB extension `2.26.4`, and Redis are reachable from the backend environment.

### Operation 23: PostgreSQL Anomaly Persistence

- What changed: added SQLAlchemy model/session modules, dependency-injected database sessions, a SQL-backed anomaly store, and route/test updates.
- Why: move anomaly-score events from process-local memory into durable PostgreSQL storage.
- How: created `AnomalyEvent`, `Database`, `SqlAnomalyStore`, and API dependency modules; updated app startup to initialize the database through FastAPI lifespan; updated anomaly-score tests to run against the database.
- Result: anomaly-score ingestion and per-session summaries now persist and read events from PostgreSQL.

### Operation 24: Verification After Persistence

- What changed: no repository content changed after the final validation commands.
- Why: verify setup and implementation before documenting, committing, and pushing.
- How: ran backend pytest in `proctor`, client Vitest, client production build, `pip check`, and npm audit.
- Result: backend tests passed, client tests passed, client build passed, `pip check` passed, and npm audit reported 0 vulnerabilities.

### Operation 25: Documentation Refresh

- What changed: updated setup notes, changelog, server README, current status, completed tasks, blockers, and this operations log.
- Why: keep the implementation documentation aligned with the verified Conda/Docker setup and database-backed backend behavior.
- How: edited project documentation after all dependency and implementation checks passed.
- Result: the next phases can start from the current, verified environment state.

## 2026-05-09: Phase 0 Gate Re-Verification And Phase 1 Redis Cache Slice

### Operation 26: Phase 0 Re-Verification Gate

- What changed: no repository content changed.
- Why: proceed with Phase 1 implementation only after confirming all readiness dependencies and services are healthy.
- How: verified Conda and `proctor` runtime, re-ran `pip check`, validated Docker Compose PostgreSQL and Redis container status, and re-ran backend/client test and build checks.
- Result: readiness gate passed with backend tests passing, client tests/build passing, and required services running.

### Operation 27: Redis Session Cache Integration

- What changed: added Redis-backed session summary cache wiring for anomaly-score summary reads, invalidation on new score ingestion, and cache-focused backend tests.
- Why: complete the planned Phase 1 basic Redis session cache task and reduce repeated database summary reads.
- How: initialized Redis in app lifespan, added `SessionCache` service, updated API dependencies/routes for read-through/write-through cache flow, and added cache invalidation test coverage.
- Result: `/api/v1/anomaly-scores/{session_id}` now uses Redis caching with invalidation on writes; backend tests pass with cache behavior verified.

### Operation 28: WebRTC Signaling Skeleton

- What changed: added a Phase 1 signaling route skeleton with Redis-backed enqueue/dequeue flow, signaling schemas, route registration, and test coverage.
- Why: complete the planned `/signaling` Phase 1 task so the project has a concrete backend signaling path for future WebRTC DataChannel wiring.
- How: implemented `POST /api/v1/signaling` and `GET /api/v1/signaling/{session_id}/{target_id}/{signal_type}` with Redis `setex/get/delete`, added schema models, and added success/invalid-path tests.
- Result: signaling messages can be queued and consumed through Redis-backed API endpoints; backend tests pass.

### Operation 29: Command Trace For Phase Gate And Signaling Slice

- What changed: no repository content changed.
- Why: maintain an exact executable trail for the user while advancing Phase 1.
- How: executed the following commands:
  - `docker compose -f infrastructure/docker/docker-compose.dev.yml up -d`
  - `docker compose -f infrastructure/docker/docker-compose.dev.yml ps -a`
  - `docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"`
  - `conda run -n proctor python -m pip check`
  - `conda run -n proctor python -m pytest`
  - `npm.cmd test`
  - `npm.cmd run build`
- Result: dependencies/services verified and the signaling backend slice validated with passing tests.

### Operation 30: Client Signaling Transport Wiring

- What changed: added a client signaling transport module, integrated signaling offer/answer API calls into the Phase 1 app flow, and added client-side signaling tests.
- Why: continue Phase 1 by moving from backend-only signaling endpoints to an end-to-end client transport path that can later be replaced with real RTCPeerConnection wiring.
- How: added `SignalingClient` with enqueue/dequeue methods, invoked offer enqueue on session start with non-blocking answer poll, and added Vitest coverage for queue and not-found behavior.
- Result: client now executes the signaling API skeleton path during session startup, and frontend/backend tests pass.

### Operation 31: Command Trace For Client Signaling Slice

- What changed: no repository content changed.
- Why: maintain an exact execution record while continuing Phase 1 implementation.
- How: executed the following commands:
  - `git status --short`
  - `Get-Content client/src/network/AnomalyScoreClient.ts`
  - `Get-Content client/src/main.ts`
  - `rg -n "network|signaling|webrtc|anomaly" client/src client/tests -S`
  - `npm.cmd test`
  - `npm.cmd run build`
  - `conda run -n proctor python -m pytest`
- Result: client signaling changes are verified with `vitest`, frontend build, and backend regression tests all passing.

### Operation 32: RTCPeerConnection Offer And ICE Wiring

- What changed: replaced placeholder offer payload creation with real `RTCPeerConnection` offer generation, local description enqueue, ICE candidate enqueue, answer polling, and remote answer application support.
- Why: continue Phase 1 toward the intended WebRTC signaling and DataChannel path with browser-native signaling primitives.
- How: added `WebRtcSignaling` module with `startWebRtcSignaling`, integrated it into `client/src/main.ts`, and added unit tests with a fake peer to validate offer enqueue and answer application behavior.
- Result: the client now creates a real WebRTC offer and emits ICE candidates through the signaling API path while retaining resilient non-blocking startup behavior.

### Operation 33: Command Trace For RTCPeerConnection Slice

- What changed: no repository content changed.
- Why: preserve an exact record of the executed verification flow.
- How: executed the following commands:
  - `git status --short`
  - `Get-Content -Path client/src/main.ts`
  - `Get-Content -Path client/src/network/SignalingClient.ts`
  - `Get-Content -Path client/tests/signaling.test.ts`
  - `npm.cmd test`
  - `npm.cmd run build`
  - `conda run -n proctor python -m pytest`
  - `npm.cmd test`
  - `npm.cmd run build`
- Result: frontend tests and build passed after typing contract fix; backend regressions also passed.

### Operation 34: RTCDataChannel Score Transport With HTTP Fallback

- What changed: added DataChannel creation in WebRTC session setup and sent anomaly-score payloads over the channel when open, with existing HTTP POST as fallback.
- Why: complete the next planned Phase 1 transport milestone and align score delivery with the low-latency unreliable channel design while preserving resilience.
- How: created an `anomaly-scores` DataChannel (`ordered: false`, `maxRetransmits: 0`), added `sendAnomalyScoreOverDataChannel` helper, updated `main.ts` send logic to prefer DataChannel, and expanded tests for open/closed channel behavior.
- Result: score payload transport now uses DataChannel first and safely falls back to HTTP when channel state is unavailable or closed.

### Operation 35: Command Trace For RTCDataChannel Slice

- What changed: no repository content changed.
- Why: keep an exact record of executed operations while continuing Phase 1.
- How: executed the following commands:
  - `git status --short`
  - `Get-Content -Path client/src/network/WebRtcSignaling.ts`
  - `Get-Content -Path client/src/main.ts`
  - `Get-Content -Path client/src/coordinator/types.ts`
  - `npm.cmd test`
  - `npm.cmd run build`
  - `conda run -n proctor python -m pytest`
- Result: frontend tests/build and backend regression tests all passed after DataChannel transport integration.

### Operation 36: Real Camera-Frame Worker Scoring

- What changed: replaced the synthetic pose/gaze placeholder worker loop with real frame-driven scoring and updated client session lifecycle to stream sampled camera frames into the worker.
- Why: move Phase 1 from synthetic score generation to real-device behavioral signal extraction while preserving privacy-safe derived outputs only.
- How: implemented frame message handling in `PoseGazeWorker`, added motion/center/brightness proxy scoring, started frame pump after session start, and added stream/pump cleanup on stop.
- Result: score emission now depends on real camera-frame dynamics instead of synthetic sine-wave values.

### Operation 37: Command Trace For Frame-Driven Worker Slice

- What changed: no repository content changed.
- Why: preserve exact command visibility while continuing implementation.
- How: executed the following commands:
  - `git status --short`
  - `Get-Content -Path client/src/workers/PoseGazeWorker.ts`
  - `Get-Content -Path client/tests/fusion.test.ts`
  - `Get-Content -Path progress/LIVE_EXECUTION_TRACKER.md`
  - `Get-Content -Path client/package.json`
  - `Get-Content -Path client/README.md`
  - `rg -n "PoseGazeWorker|MediaPipe|pose" client/src client/tests docs -S`
  - `npm.cmd test`
  - `npm.cmd run build`
  - `conda run -n proctor python -m pytest`
- Result: frontend tests/build and backend regression tests passed after integrating frame-driven worker scoring.

### Operation 38: MediaPipe Pose Worker Integration

- What changed: integrated direct `@mediapipe/pose` worker usage with landmark-based pose scoring and automatic fallback to frame-proxy scoring when model init or inference is unavailable.
- Why: move Phase 1 pose/gaze channel closer to the intended MediaPipe path while keeping runtime resilience.
- How: switched from placeholder/heuristic-only worker path to MediaPipe Pose `send/onResults` flow, computed score using nose/shoulder landmarks, and retained fallback path for robustness.
- Result: MediaPipe Pose integration is active in worker code and frontend build/tests pass.

### Operation 39: Command Trace For MediaPipe Integration Slice

- What changed: no repository content changed.
- Why: keep exact command visibility while continuing implementation.
- How: executed the following commands:
  - `Get-Content -Path client/src/workers/PoseGazeWorker.ts`
  - `Get-Content -Path client/tsconfig.json`
  - `Get-Content -Path client/src/vite-env.d.ts`
  - `npm.cmd test`
  - `npm.cmd run build`
  - `npm.cmd ls @mediapipe/pose @tensorflow-models/pose-detection`
  - `Get-Content -Path node_modules/@mediapipe/pose/index.d.ts -TotalCount 120`
  - `npm.cmd test`
  - `npm.cmd run build`
- Result: build-blocking package/export mismatch was resolved by switching to direct MediaPipe API integration and the client checks passed.

### Operation 40: Manual Browser Session Validation

- What changed: no source code changed during the manual validation step itself; validation evidence was captured and documented.
- Why: Phase 1 acceptance requires a real webcam-enabled browser run beyond automated tests.
- How: launched backend and frontend dev servers, opened `http://127.0.0.1:5173`, started a session with webcam permission, observed live score payload updates, and verified runtime transport status in UI.
- Result: runtime path verified with live anomaly score output and status text `Sent tier_3 (HTTP fallback)`, confirming worker scoring + local persistence + backend fallback ingestion in a real session.

### Operation 41: Local Proctor Loopback For DataChannel Validation

- What changed: added a local answering peer loopback flow and student-side remote ICE ingestion to support DataChannel-open validation in a single local environment.

### Operation 42: DataChannel Diagnostic Instrumentation And Closure

- What changed: added deep client-side WebRTC diagnostics (peer/signaling/ICE/datachannel states, answer parse/apply diagnostics, loopback diagnostics, signaling dequeue trace), stabilized local loopback negotiation by waiting for ICE gather completion before sending offer/answer SDP, and extended polling timing to avoid early candidate miss.
- Why: repeated runs showed `DataChannel: connecting` despite successful offer/answer exchange; exact runtime telemetry was needed to locate and resolve the remaining negotiation timing issue.
- How: updated `client/src/network/WebRtcSignaling.ts`, `client/src/network/LocalProctorLoopback.ts`, `client/src/network/SignalingClient.ts`, `client/src/main.ts`, `client/src/styles.css`, and `client/tests/webrtc-signaling.test.ts`; iteratively validated with user-shared runtime debug JSON plus `npm.cmd test` and `npm.cmd run build`.
- Result: DataChannel-open path confirmed in runtime with `event: datachannel_open`, `answer_received: true`, `peer_connection_state: connected`, `peer_ice_connection_state: connected`, and `remote_ice_candidates: 1`.

### Operation 43: Backend Hardening - Rate Limiting, Live Session State, Alembic Baseline

- What changed: added Redis-backed ingestion rate limiter, Redis-backed live session state service, session-state API route, Alembic configuration scaffold, and first baseline migration revision.
- Why: proceed to the next implementation-plan items after Phase 1 transport closure, specifically backend operational hardening and migration readiness.
- How: implemented `RateLimiter` and `SessionStateStore` services; wired dependency injection and route updates in anomaly ingestion and new session state route; added Alembic files under `server/alembic.ini` and `server/src/db/migrations`; added/updated backend tests.
- Result: anomaly ingestion now enforces a token-window style limit with HTTP 429 on overflow, session state is queryable via `GET /api/v1/sessions/{session_id}/state`, and backend tests pass (`8 passed`).

### Operation 44: Alembic-Managed Startup Migration Flow

- What changed: switched backend startup initialization from SQLAlchemy `Base.metadata.create_all` to Alembic `upgrade head`, added fast database connection timeouts for both SQLAlchemy and Alembic engines, added a legacy-schema compatibility stamp for databases created before Alembic adoption, and cleaned Alembic config warnings.
- Why: complete the next planned step so schema lifecycle is migration-driven rather than implicit table creation, while keeping existing local development databases usable.
- How: updated `server/src/bezp_server/db/session.py`, `server/src/db/migrations/env.py`, `server/src/db/migrations/versions/20260508_0001_create_anomaly_events.py`, `server/alembic.ini`, and startup regression tests; restarted local containers when PostgreSQL was found offline during validation.
- Result: backend startup now runs Alembic-managed migrations, legacy local databases are stamped to baseline instead of failing on duplicate tables, and backend tests pass (`9 passed`).

## 2026-05-08: Phase 1 Runtime Reliability And Live Datapoints Visibility

### Operation 34: Live Webcam Datapoints Surface

- What changed: extended worker-to-UI message schema and client rendering to display live frame datapoints (`centerX`, `centerY`, `motion`, `brightness`, `brightnessShift`) and landmark coordinates when available.
- Why: make it verifiable that displayed results are derived from live webcam frames and not synthetic random values.
- How: updated `client/src/coordinator/types.ts`, `client/src/workers/PoseGazeWorker.ts`, `client/src/main.ts`, and `client/src/styles.css`; then ran `npm.cmd run build` and `npm.cmd test`.
- Result: camera panel now includes a continuously updating JSON datapoint block tied to live frame processing output.

### Operation 35: Backend CORS Fix For Vite Dynamic Port

- What changed: broadened FastAPI CORS origin matching to allow `localhost` and `127.0.0.1` on dynamic dev ports.
- Why: browser requests from `http://127.0.0.1:5175` were blocked, causing `Stored locally; API unavailable` despite backend availability.
- How: added `allow_origin_regex` in `server/src/bezp_server/main.py`, restarted backend, validated preflight headers for origin `http://127.0.0.1:5175`.
- Result: UI now sends anomaly events to backend successfully; status observed as `Sent tier_3 (HTTP fallback)`.

### Operation 36: Signaling Queue Hardening

- What changed: switched signaling storage from single-key overwrite to Redis list queue semantics.
- Why: offer/ICE message overwrite risk could drop signaling events and destabilize DataChannel setup.
- How: changed signaling route enqueue/dequeue to `RPUSH` + `LPOP` with TTL refresh in `server/src/bezp_server/api/routes/signaling.py`; ran `conda run -n proctor pytest -q`.
- Result: backend signaling path preserves sequential messages reliably; tests pass (`6 passed`).
- Why: the prior manual run validated HTTP fallback but did not validate the DataChannel-open path due missing answering peer behavior.
- How: added `LocalProctorLoopback` responder module, started/stopped it with session lifecycle in `main.ts`, and extended `WebRtcSignaling` to ingest remote ICE candidates after answer application.
- Result: local environment now has a concrete answering flow needed to validate `Sent ... (DataChannel)` behavior.
