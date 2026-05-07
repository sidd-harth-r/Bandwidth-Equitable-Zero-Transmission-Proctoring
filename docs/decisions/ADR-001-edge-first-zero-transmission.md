# ADR-001: Edge-First Inference And Zero Continuous Video Transmission

## Status

Accepted

## Context

The project exists to address bandwidth inequality and privacy risk in cloud-centric proctoring. Continuous video streaming creates high upload requirements and centralizes sensitive biometric data.

## Decision

BEZP will run behavioral analysis locally in the browser and will not transmit continuous raw video. The client may transmit derived anomaly scores, telemetry, differentially private model updates, and bounded Tier 2 clips generated only for human review events.

## Rationale

This decision directly supports the project's equity and privacy goals. It also shapes the system architecture: browser workers perform inference, WebRTC carries low-latency scores, HTTPS carries reliable clip and gradient uploads, and server-side services process metadata rather than continuous biometric streams.

## Consequences

- Client implementation is more complex because inference, storage, calibration, and post-exam training happen in the browser.
- Testing must include packet validation to prove that continuous video is not transmitted.
- Human review depends on event-triggered clips and anomaly timelines instead of a full-session video stream.
- Some identity verification capabilities remain out of scope because strong biometric enrollment conflicts with the privacy posture.
