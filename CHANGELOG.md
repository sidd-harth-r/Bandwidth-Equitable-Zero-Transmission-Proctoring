# Changelog

All notable project changes are recorded here. Every future implementation PR should add an entry with date, what changed, why it changed, and any replacement or migration details.

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
