# Changelog

All notable project changes are recorded here. Every future implementation PR should add an entry with date, what changed, why it changed, and any replacement or migration details.

## 2026-05-08

### Added

- Started Phase 1 implementation with a FastAPI backend package, health endpoint, anomaly-score ingestion endpoint, in-memory score store, and backend tests.
- Added a Vite/TypeScript client shell with a pose/gaze placeholder Web Worker, fusion engine, tier classifier, IndexedDB session store, anomaly-score API client, and client tests.
- Added generated `client/package-lock.json` after installing client dependencies.

### Changed

- Pinned Phase 1 backend dependencies to versions compatible with the local MSYS Python environment.
- Moved native database and ML dependencies into optional backend dependency groups for later installation on a standard Conda/CPython setup.

### Verified

- `server`: `python -m pytest` passed.
- `client`: `npm test` passed.
- `client`: `npm run build` passed.
- `proctor`: `pip check` passed.

### Dependency Notes

- Upgraded Vite/Vitest/TypeScript dev dependencies after initial audit findings; `npm audit --audit-level=moderate` now reports 0 vulnerabilities.
- SQLAlchemy/Alembic/NumPy/SciPy/Flower were not installed in this local MSYS Python environment because native extension builds failed. They remain documented for the Conda/Docker phase.

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
