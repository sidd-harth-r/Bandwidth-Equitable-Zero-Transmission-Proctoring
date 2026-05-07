# Client Architecture

The client owns local sensing, inference, storage, calibration, network adaptation, and post-exam training.

## Planned Modules

- `src/coordinator`: worker orchestration, fusion, tier classification, and gear state.
- `src/workers`: pose/gaze, rPPG, facial AU, keystroke, and FL model workers.
- `src/audio`: AudioWorklet lifecycle and spectral features.
- `src/storage`: IndexedDB schemas, baselines, and session records.
- `src/network`: WebRTC, clip upload, telemetry, and gradient upload.
- `src/calibration`: pre-exam baseline capture.
- `src/fl`: local training, compression, differential privacy, and model cache.
- `src/exam`: session lifecycle and UI behavior.
- `src/service-worker`: offline queue and model cache.

## Implementation Rule

Every worker boundary must use typed messages. Every message carrying sensor-derived data must be reviewed for privacy before network transmission is allowed.
