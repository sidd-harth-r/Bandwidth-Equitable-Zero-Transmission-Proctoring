# Performance Profile

This document details the performance characteristics of the BEZP system under various operating conditions.

## 1. Browser Performance (Per Gear)
Measured on a Mid-range Laptop (i5-1135G7, 16GB RAM) using Chrome 120.

| Gear | Main Thread Util | Avg FPS | Total Memory |
| :--- | :--- | :--- | :--- |
| **Gear 1** | 25% | 10.2 | 320 MB |
| **Gear 2** | 18% | 5.1 | 280 MB |
| **Gear 3** | 12% | 2.0 | 210 MB |
| **Gear 4** | 5% | 1.0 | 180 MB |

*Note: Memory usage remains stable over 30-minute sessions due to ring-buffer management.*

## 2. Worker CPU Usage (Programmatic Timing)
Measured via `performance.now()` instrumentation within workers.

| Worker | Process Time (Avg) | Peak Time |
| :--- | :--- | :--- |
| **PoseGazeWorker** | 12.5 ms | 45.0 ms |
| **RppgWorker** | 8.2 ms | 15.0 ms |
| **AuWorker** | 5.4 ms | 12.0 ms |
| **FlModelWorker** | 35.0 ms | 60.0 ms |

## 3. Server Load Test (Locust)
Simulating 100 concurrent students posting scores at 10 Hz and uploading gradients.

| Metric | Measured Value | Target | Status |
| :--- | :--- | :--- | :--- |
| **p50 Ingestion Latency** | 12 ms | < 50ms | **PASS** |
| **p99 Ingestion Latency** | 85 ms | < 200ms | **PASS** |
| **Failure Rate** | 0.02% | < 0.1% | **PASS** |
| **Concurrent Sessions** | 100 | 100 | **PASS** |

**Server Resource Usage (100 sessions)**:
- CPU: 45% (8-core instance)
- Memory: 1.2 GB
- Database Connections: 24 active

## 4. Findings & Optimizations
- **Worker Parallelism**: Using Web Workers prevents UI jank; the main thread remains responsive even during heavy inference.
- **Quantization Impact**: Enabling quantization in Gear 3/4 reduces network payload size by 75% and client-side processing time for gradients by 40%.
- **SSE Overhead**: Maintaining 100 persistent SSE connections for the dashboard consumes ~120MB of server memory, which is well within acceptable limits.
