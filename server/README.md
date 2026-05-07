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
- `/api/v1/anomaly-scores/{session_id}` in-memory summary.
- Pydantic validation for derived score payloads.

Run locally from the repository root:

```powershell
.\proctor\bin\python.exe -m uvicorn bezp_server.main:app --app-dir server/src --reload
```

Run tests:

```powershell
cd server
..\proctor\bin\python.exe -m pytest
```
