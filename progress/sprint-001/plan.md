# Sprint 001 Plan

## Goal

Start Phase 1 by building the first vertical slice: browser pose/gaze score to backend ingestion and database storage.

## Planned Tasks

1. Initialize strict TypeScript client.
2. Initialize FastAPI backend.
3. Add Docker Compose service startup.
4. Define shared score and event schemas.
5. Implement IndexedDB session store.
6. Implement pose/gaze worker proof of concept.
7. Implement basic fusion passthrough.
8. Implement anomaly-score ingestion endpoint.
9. Add first integration test.

## Acceptance Criteria

- A local browser session emits a pose/gaze score.
- The score is stored locally and ingested by the backend.
- No continuous video payload is transmitted.
