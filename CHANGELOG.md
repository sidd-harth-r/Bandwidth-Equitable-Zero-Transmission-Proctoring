# Changelog

All notable project changes are recorded here. Every future implementation PR should add an entry with date, what changed, why it changed, and any replacement or migration details.

## 2026-05-08

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
