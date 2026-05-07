# Data Flow

## Normal Exam Monitoring

| Data | Origin | Destination | Frequency | Raw Biometric? |
| --- | --- | --- | --- | --- |
| Channel scores | workers | coordinator | device-adaptive | no |
| Fused score | coordinator | IndexedDB | every update | no |
| Anomaly score payload | coordinator | FastAPI via WebRTC | about every 10 seconds | no |
| Network telemetry | client | FastAPI | about every 30 seconds | no |
| Background difference metric | client | IndexedDB and tier logic | about every 30 seconds | no |

## Exceptional Review Flow

| Data | Origin | Destination | Trigger |
| --- | --- | --- | --- |
| 30-second clip | RAM rolling buffer | FastAPI clip endpoint | Tier 2 event |
| Reviewer decision | dashboard | PostgreSQL | proctor action |
| Verified label | PostgreSQL | FL training metadata | aggregation/training |

## Post-Exam Flow

| Data | Origin | Destination | Timing |
| --- | --- | --- | --- |
| Local training dataset | IndexedDB | FL worker | after submission |
| Gradient delta | FL worker | HTTPS endpoint | after local training |
| Global model version | server | service worker cache | after accepted aggregation |
