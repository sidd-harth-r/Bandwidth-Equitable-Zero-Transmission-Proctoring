# Federated Learning Architecture

The FL system improves future exam sessions. It does not update the model during an active exam.

## Client Flow

1. Load frozen global model before exam.
2. Run inference during exam.
3. After submission, load full session features from IndexedDB.
4. Train locally for a bounded number of epochs.
5. Compute gradient delta.
6. Compress, quantize when needed, clip, and add DP noise.
7. Upload gradient payload through HTTPS.
8. Clear synced session data and retain allowed baselines.

## Server Flow

1. Validate and deserialize gradient payloads.
2. Queue submissions by age and network tier.
3. Trigger aggregation after 50 submissions or 7 days.
4. Run tiered FedAvg.
5. Validate against synthetic scenarios.
6. Reject updates with more than 2 percent degradation.
7. Version accepted model and broadcast to clients.

## Human Labels

Verified proctor decisions are treated as 10x-weighted samples in training metadata because they are higher-quality than self-supervised fused scores.
