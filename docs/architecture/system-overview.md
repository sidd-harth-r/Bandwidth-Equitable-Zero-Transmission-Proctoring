# System Overview

BEZP is an edge-first proctoring system. The browser client performs local inference and transmits only derived signals during the exam. The server coordinates sessions, stores audit records, receives human-review clips when needed, and aggregates differentially private federated-learning updates after exams.

## Main Runtime Loops

- Pre-exam loop: permissions, model cache, gesture verification, room scan, baselines, and initial gear.
- Inference loop: worker outputs, fusion, tier classification, IndexedDB writes, and anomaly-score transmission.
- Review loop: Tier 2 clip extraction, upload, dashboard queueing, reviewer decisions, and verified labels.
- Federated-learning loop: post-exam local training, gradient upload, server aggregation, validation, and model broadcast.
- Network loop: telemetry, gear transitions, worker configuration, retry queues, and suspension rules.

## Privacy Boundary

Raw continuous video, raw audio, and key content must not leave the student device. The only intended media upload is a bounded Tier 2 clip created from an in-memory buffer after a review-triggering event.
