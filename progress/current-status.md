# Current Status

## 2026-05-08

Foundation documentation and repository structure have been created. Phase 1 implementation has started with a backend anomaly-score API and a Vite/TypeScript client score slice.

## Working

- Git repository with GitHub remote.
- Documentation map.
- Planned directory structure.
- `proctor` environment definition.
- Local `proctor` Python virtual environment for Phase 1.
- Client dependencies installed through `npm.cmd install`.
- FastAPI health endpoint and anomaly-score ingestion endpoint.
- Client fusion engine, tier classifier, placeholder pose/gaze worker, IndexedDB store, and HTTP score sender.
- Backend and client tests passing.

## In Progress

- Replace placeholder pose/gaze worker with MediaPipe Pose.
- Replace HTTP score fallback with WebRTC DataChannel path.
- Add PostgreSQL/Redis once Docker or a standard Python environment is available.

## Blocked

- PDF source extraction was not reliable with local tools.
- Docker and Conda are not installed on this machine.
- Native Python database/ML dependencies could not be installed with the current MSYS Python compiler setup.
- Native Python database/ML dependencies are still pending a standard Conda/CPython or Docker setup.

## Next

- Wire MediaPipe Pose into `PoseGazeWorker`.
- Add WebRTC signaling and unreliable DataChannel score transport.
- Add PostgreSQL-backed anomaly event persistence.
