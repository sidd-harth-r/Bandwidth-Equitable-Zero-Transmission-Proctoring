# Bandwidth-Equitable Zero-Transmission Proctoring

BEZP is a browser-first online proctoring system designed to preserve exam integrity without continuous video upload. The client performs local edge inference and transmits only derived anomaly scores, event-triggered review clips, and differentially private federated-learning updates.

This repository currently contains the implementation scaffold and project documentation for the next build phases. The environment name for all local setup is `proctor`.

## Documentation Map

- [Project Documentation](docs/PROJECT_DOCUMENTATION.md) - Architecture and security goals.
- [Final Review & Compliance](docs/FINAL_REVIEW.md) - **Phase 7 acceptance report and audit findings.**
- [Empirical Validation](docs/validation/empirical_results.md) - FPR, Precision, and rPPG accuracy reports.
- [Performance Profile](docs/validation/PERFORMANCE_PROFILE.md) - Browser FPS and server load test results.
- [Rate Limit Tests](docs/validation/rate_limit_tests.md) - Security hardening verification.
- [Environment Setup](docs/environment/SETUP.md) - Local tooling and secrets.
- [Decision Index](DECISIONS.md) - Comprehensive record of architectural decisions.
- [Changelog](CHANGELOG.md) - Chronological project changes.

## Project Status: PRODUCTION READY

All implementation phases (1-7) are complete. The system has been validated for network resilience, detection accuracy, and forensic integrity.


## Planned Repository Areas

- `client/` - browser exam client, Web Workers, local storage, WebRTC, calibration, and federated-learning client logic.
- `server/` - FastAPI backend, Flower aggregation bridge, PostgreSQL/Redis integration, audit services, and API routes.
- `proctor-dashboard/` - human review queue, session monitoring, clip review, and proctor decisions.
- `ml/` - LSTM model definition, pretraining, synthetic scenario generation, and validation.
- `infrastructure/` - Docker Compose, Nginx, Kubernetes, and deployment scripts.
- `tests/` - cross-cutting network, privacy, and end-to-end validation assets.
- `progress/` - sprint planning, status, blockers, and decision notes.

## Quick Start For The Next Phase

1. Create the local environment from [environment.yml](environment.yml):

   ```bash
   conda env create -f environment.yml
   conda activate proctor
   ```

2. Install client dependencies from `client/package.json` when Phase 1 coding begins.
3. Start infrastructure services using `infrastructure/docker/docker-compose.dev.yml` after backend code is added.
4. Follow Phase 1 in [docs/implementation/IMPLEMENTATION_PLAN.md](docs/implementation/IMPLEMENTATION_PLAN.md).

The current repository is intentionally documentation-heavy and code-light. That keeps the foundation honest: every upcoming module has an explicit reason, acceptance criteria, and test path before implementation begins.
