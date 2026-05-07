# Architectural Decision Index

This file indexes decisions that affect architecture, privacy, reliability, testing, or deployment. Add one ADR for every non-obvious choice.

| ADR | Status | Decision |
| --- | --- | --- |
| [ADR-001](docs/decisions/ADR-001-edge-first-zero-transmission.md) | Accepted | Use edge-first browser inference and prohibit continuous video transmission. |

## Decision Rules

- Prefer browser-native APIs where they satisfy privacy and performance requirements.
- Keep raw biometric data on device unless a Tier 2 human-review clip is explicitly generated.
- Separate low-latency inference traffic from reliable training and clip upload traffic.
- Treat human-reviewed labels as higher-quality training signals than self-supervised anomaly scores.
- Record implementation decisions in `progress/sprint-*/decisions-made.md` and promote durable decisions into ADRs.
