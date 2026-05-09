# Rate-Limit Bypass Tests and Hardening

This document summarizes the results of the rate-limiting stress tests conducted on the BEZP server.

## 1. Score Flood Test
- **Objective**: Verify that the server correctly drops anomaly score updates if a client attempts to flood the endpoint.
- **Limit**: 180 requests per 60 seconds (3 Hz average, allows for bursts).
- **Test Method**: Scripted flood at 100 Hz for 10 seconds.
- **Results**:
  - First 180 requests accepted.
  - Subsequent requests rejected with `429 Too Many Requests`.
  - `Retry-After` header correctly provided the wait time.
- **Status**: **PASS**

## 2. Cross-Session Student-Level Limiting
- **Objective**: Ensure that a student cannot bypass limits by starting multiple sessions or using different session IDs.
- **Limit**: Cumulative 600 anomaly scores per 10 minutes per `student_id`.
- **Test Method**: Start two sessions for the same `student_id` and send 400 scores from each.
- **Results**:
  - Session 1: 400 scores accepted.
  - Session 2: First 200 scores accepted, next 200 rejected.
- **Status**: **PASS**

## 3. Gradient Submission Limiting
- **Objective**: Prevent denial-of-service via large gradient payload uploads.
- **Limit**: 1 submission per hour per `session_id`.
- **Test Method**: Attempt to upload gradients twice for the same `session_id`.
- **Results**:
  - First upload accepted.
  - Second upload rejected with `429 Too Many Requests`.
- **Status**: **PASS**

## 4. Admin Rollback Limiting
- **Objective**: Prevent accidental or malicious rapid model rollbacks.
- **Limit**: 5 operations per hour.
- **Test Method**: Attempt 10 rollbacks in 1 minute using the admin key.
- **Results**:
  - First 5 succeeded.
  - 6th attempt rejected.
- **Status**: **PASS**

## Hardening Measures
- All rate limits are enforced at the API gateway level (FastAPI dependencies) using Redis for low-latency tracking.
- `X-Admin-Key` requirement for administrative actions.
- Client-side throttling in `Coordinator.ts` to respect target FPS and avoid unnecessary network usage.
