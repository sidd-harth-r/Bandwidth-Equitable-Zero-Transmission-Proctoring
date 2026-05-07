# Server

FastAPI backend and federated-learning coordination layer.

Planned responsibilities:

- WebRTC signaling.
- Anomaly-score ingestion.
- Clip ingestion.
- Proctor review decisions.
- Gradient ingestion and Flower aggregation.
- PostgreSQL audit records.
- Redis session state, rate limiting, and FL queues.
- Model validation and broadcast.

## Phase 1 Status

Implemented now:

- FastAPI app factory.
- `/api/v1/health`.
- `/api/v1/anomaly-scores` POST ingestion.
- `/api/v1/anomaly-scores/{session_id}` PostgreSQL-backed summary.
- Pydantic validation for derived score payloads.
- SQLAlchemy database session wiring.
- Automatic local table creation for Phase 1 development.

Start local services from the repository root:

```powershell
docker compose -f infrastructure/docker/docker-compose.dev.yml up -d
```

Run locally from the repository root:

```powershell
& 'C:\Users\siddh\anaconda3\Scripts\conda.exe' run -n proctor python -m uvicorn bezp_server.main:app --app-dir server/src --reload
```

Run tests:

```powershell
cd server
& 'C:\Users\siddh\anaconda3\Scripts\conda.exe' run -n proctor python -m pytest
```
