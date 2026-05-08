# Current Status

## 2026-05-09

Phase 1 core vertical slice is operational end-to-end: camera-frame worker scoring, local storage, signaling/DataChannel transport path, and backend ingestion with PostgreSQL persistence.

## Working

- Git repository with GitHub remote.
- Documentation map.
- Planned directory structure.
- Verified Conda environment named `proctor`.
- Docker Compose PostgreSQL/TimescaleDB and Redis development services.
- Client dependencies installed through `npm.cmd install`.
- FastAPI health endpoint and anomaly-score ingestion endpoint.
- PostgreSQL-backed anomaly event persistence through SQLAlchemy.
- Client fusion engine, tier classifier, camera-frame + MediaPipe pose worker path with fallback, IndexedDB store, and DataChannel-first score sender with HTTP fallback.
- Backend and client tests, client build, pip integrity check, and npm audit passing.
- Manual browser run with webcam permission confirmed live score emission and HTTP fallback status updates.
- Live datapoint panel now shows frame-derived metrics (`centerX`, `centerY`, `motion`, `brightness`, `brightnessShift`) and landmark coordinates when MediaPipe path is active.
- Backend CORS now supports dynamic local Vite ports (`localhost`/`127.0.0.1`) to prevent false API-unavailable states in browser sessions.
- Signaling backend now uses Redis queue semantics to avoid overwriting offer/ICE messages under burst conditions.
- Local DataChannel-open path is now verified with runtime diagnostics (`datachannel_open`, `connected` ICE states, and remote ICE candidate ingestion).
- Redis-backed rate limiting is implemented for anomaly-score ingestion, signaling enqueue/dequeue, and session-state reads.
- Redis-backed live session state is implemented and exposed at `GET /api/v1/sessions/{session_id}/state`.
- Alembic baseline scaffold and first migration revision are added under `server/src/db/migrations`.
- Backend startup now runs Alembic-managed migrations instead of `Base.metadata.create_all`, with a legacy-schema compatibility stamp for pre-Alembic local databases.

## In Progress

- Add additional migration revisions as backend schema grows.
- Add explicit session-level integration report artifacts for Phase 1 acceptance evidence.

## Blocked

- PDF source extraction was not reliable with local tools.
- Real webcam/browser validation must be performed outside this terminal environment.
- Wireshark packet captures and network shaping require local/manual machine access.

## Next

- Add session coordination features on top of the Redis live state store.
- Add explicit session-level integration report artifacts for Phase 1 acceptance evidence.
