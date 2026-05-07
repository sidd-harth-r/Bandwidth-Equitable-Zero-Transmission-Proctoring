# Testing Strategy

## 1. Testing Goals

Testing must prove three project claims:

- Privacy: raw continuous biometric video does not leave the device.
- Equity: the exam remains functional under degraded network conditions.
- Integrity: anomaly detection produces useful signals with controlled false positives.

## 2. Test Layers

| Layer | Scope | Tooling |
| --- | --- | --- |
| Unit | signal processing, fusion, gear logic, schemas | Vitest, Pytest |
| Worker | browser workers and AudioWorklet behavior | browser test runner, Playwright later |
| Integration | client storage, score transport, FastAPI ingestion | Playwright, Pytest, Docker Compose |
| End-to-end | full pre-exam, active exam, post-exam flows | browser automation and local services |
| Network | gear transitions and offline queueing | Linux `tc`, browser telemetry, server logs |
| Privacy | packet payload validation and storage boundaries | Wireshark, storage inspection |
| Performance | FPS, latency, bandwidth, training time | browser performance APIs, server metrics |

## 3. Core Scenario Matrix

| Scenario | Network Conditions | Pass Criteria |
| --- | --- | --- |
| S1 Broadband | RTT 20 ms, packet loss 0.1 percent | Gear 1, all channels active, score delivery below 100 ms target. |
| S2 Standard Mobile | RTT 100 ms, packet loss 1 percent | Gear 2, compression enabled, exam stable. |
| S3 Congested | RTT 200 ms, packet loss 3 percent | Gear 3, quantization enabled, local buffering active. |
| S4 Extreme 3G | RTT 500 ms, packet loss 10 percent | Gear 4, offline-first behavior, suspend after 5 minutes. |
| S5 Whisper plus gaze | Broadband | fused score above 0.70 and Tier 1 or Tier 2 triggered. |
| S6 Legitimate scratch paper | Broadband | fused score below 0.40 and no false positive. |
| S7 Phone in frame | Any | phone deterministic rule forces Tier 1. |
| S8 Second person enters | Any | multi-skeleton rule forces Tier 1. |
| S9 Baseline poisoning | Broadband | calibration gating prevents poisoned baseline. |

## 4. Privacy Validation

Required checks:

- Confirm anomaly-score payloads contain scores, timestamps, tier, gear, and channel metadata only.
- Confirm no JPEG, WebM, H.264, or raw frame-like continuous payloads are transmitted during normal monitoring.
- Confirm Tier 2 clips upload only after a Tier 2 trigger.
- Confirm rolling clip buffer is RAM-only.
- Confirm keystroke module stores timing metadata only, not key content.
- Confirm gradient payloads are clipped and noised before upload.
- Confirm local IndexedDB can be cleared after successful post-exam sync.

## 5. Unit Test Requirements

### Client

- Fusion weighted mean.
- Channel Agreement Index.
- Tier classifier boundaries.
- Gear state transitions and hysteresis.
- Keystroke feature extraction.
- DP clipping and Gaussian noise.
- Gradient compression and quantization.
- IndexedDB migrations.

### Server

- Pydantic request validation.
- Auth middleware behavior.
- Rate limiter token bucket.
- Anomaly score ingestion.
- Clip metadata ingestion.
- Gradient deserialization.
- Model validation gate.
- Hash-chain append and validation.

## 6. Integration Test Requirements

- Browser session creates local exam session.
- Worker emits first channel score.
- Coordinator writes to IndexedDB.
- Client sends score to backend.
- Backend validates and stores score.
- Dashboard can read active session summary.
- Post-exam training creates a gradient payload.
- Server accepts gradient and queues it for aggregation.

## 7. Performance Targets

| Metric | Target |
| --- | --- |
| False positive rate on legitimate exam behavior | below 5 percent |
| Detection precision on simulated cheating | above 90 percent |
| Gear 1 anomaly score latency, 99th percentile | below 150 ms |
| Bytes transmitted per exam excluding Tier 2 clips | below 1 MB |
| Post-exam training time on mid-range laptop | below 7 minutes |
| FL round accuracy degradation after 50 rounds | below 2 percent relative |
| Exam completion rate across gear states | above 99 percent |

## 8. Test Data Policy

- Do not commit raw webcam, microphone, or participant data.
- Commit only synthetic fixtures, anonymized summaries, or generated metrics.
- Store raw validation captures outside Git with consent and retention rules.
- Keep packet-capture summaries in docs; do not commit full private captures.

## 9. Regression Rules

Any future code change touching privacy, networking, fusion, storage, or FL must include tests or documented manual validation. Do not accept "works locally" as evidence for privacy-sensitive behavior.
