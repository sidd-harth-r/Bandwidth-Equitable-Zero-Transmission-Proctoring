# Current Status

## 2026-05-08

Foundation documentation and repository structure have been created. Phase 1 implementation has started with a backend anomaly-score API, PostgreSQL persistence, and a Vite/TypeScript client score slice.

## Working

- Git repository with GitHub remote.
- Documentation map.
- Planned directory structure.
- Verified Conda environment named `proctor`.
- Docker Compose PostgreSQL/TimescaleDB and Redis development services.
- Client dependencies installed through `npm.cmd install`.
- FastAPI health endpoint and anomaly-score ingestion endpoint.
- PostgreSQL-backed anomaly event persistence through SQLAlchemy.
- Client fusion engine, tier classifier, placeholder pose/gaze worker, IndexedDB store, and HTTP score sender.
- Backend and client tests, client build, pip integrity check, and npm audit passing.

## In Progress

- Replace placeholder pose/gaze worker with MediaPipe Pose.
- Replace HTTP score fallback with WebRTC DataChannel path.
- Add Alembic migrations for the database schema.
- Add Redis-backed session state and rate limiting.

## Blocked

- PDF source extraction was not reliable with local tools.
- Real webcam/browser validation must be performed outside this terminal environment.
- Wireshark packet captures and network shaping require local/manual machine access.

## Next

- Wire MediaPipe Pose into `PoseGazeWorker`.
- Add WebRTC signaling and unreliable DataChannel score transport.
- Add Alembic migrations and Redis-backed live session state.
