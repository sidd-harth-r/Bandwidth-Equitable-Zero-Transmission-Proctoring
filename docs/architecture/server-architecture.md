# Server Architecture

The backend is planned as a FastAPI application with PostgreSQL, Redis, and Flower integration.

## Planned Modules

- `api/routes/signaling.py`: WebRTC signaling.
- `api/routes/anomaly_scores.py`: anomaly score ingestion.
- `api/routes/gradients.py`: FL gradient ingestion.
- `api/routes/clips.py`: Tier 2 clip ingestion.
- `api/routes/proctor.py`: review decisions and session history.
- `api/routes/telemetry.py`: network metrics.
- `api/middleware/auth.py`: institution auth and session validation.
- `api/middleware/rate_limiter.py`: Redis token bucket rate limiting.
- `fl/`: Flower server, browser adapter, tiered strategy, model validator, and gradient deserializer.
- `services/`: hash chain, proctor review, and model broadcast.
- `db/`: PostgreSQL and Redis connections plus migrations.

## Storage Rule

Records that may be used in academic integrity review must be append-oriented and hash-chain auditable.
