# Source Document Review

## Reviewed Sources

| Source | Use In This Repository |
| --- | --- |
| `BEZP_Technical_Specification_v2 (1).docx` | Primary architecture, modules, phases, testing, security, file structure, and technology stack. |
| `3. EL Synopsis format.docx` | Methodology, problem definition, objectives, literature framing, and expected outcomes. |
| `Experiential Learning Phase -1 Template - III Semester (1).pptx` | Presentation-level methodology, MVP framing, tools, outcomes, and next steps. |
| `project_description_document.md.pdf` | Present in the parent folder. Local text extraction produced mostly PDF/font artifacts, so it was not used as an authoritative source in this pass. |

## Consolidated Requirements

### Functional Requirements

- Run exam proctoring in the browser without native installation.
- Capture webcam, microphone, and keystroke timing only after explicit user permission and disclosure.
- Execute local edge inference in isolated workers.
- Produce anomaly scores instead of sending continuous video.
- Store local session signals in IndexedDB.
- Maintain a RAM-only rolling video buffer for Tier 2 event clips.
- Upload short clips only when Tier 2 human review is triggered.
- Support proctor decision capture and feedback into model training.
- Train local model updates after exam completion.
- Aggregate client updates through federated learning without raw behavioral data leaving the device.

### Detection Requirements

- Pose and gaze analysis through MediaPipe Pose and Face Mesh.
- rPPG heart rate and HRV deviation from student baseline.
- Facial action unit analysis for sustained stress expressions.
- Keystroke dynamics without key-content recording.
- Multi-person skeleton deterministic rule.
- Phone-object deterministic rule.
- Background-change deterministic rule.
- Two-stage fusion using channel agreement and weighted score.
- Personalized tier thresholds using session-history prior.

### Network Requirements

- Use WebRTC unreliable DataChannels for low-latency anomaly scores.
- Use HTTPS POST for clips and gradient payloads.
- Implement 4-gear network degradation using RTT and packet loss.
- Keep the exam functional in degraded network states.
- Suspend after 5 continuous minutes of Gear 4/offline operation.

### Privacy Requirements

- No continuous raw video transmission.
- No key content storage.
- Differential privacy for gradient payloads.
- Audit trails for server-side records.
- Honest limitations for rPPG, facial AUs, identity continuity, and cold-start FL.

### Testing Requirements

- Unit tests for each channel and fusion component.
- Integration tests for client-to-server score flow.
- Network stress tests across all four gear states.
- Wireshark or equivalent packet capture validation for zero continuous video transmission.
- False-positive measurement on legitimate behavior.
- Detection precision measurement on simulated cheating scenarios.
- Hash-chain tamper validation.

## Methodology Mapping

| Methodology Item | Repository Response |
| --- | --- |
| Edge computing model | `client/` worker and local storage architecture. |
| Federated learning with FedAvg | `ml/` and `server/src/fl/` planned structure. |
| Distributed asynchronous loops | Separate inference loop, training loop, clip upload path, and telemetry path. |
| Multi-modal anomaly detection | Four probabilistic channels plus deterministic rule layers. |
| Network-aware adaptation | `GearStateMachine` plan and network testing docs. |
| Differential privacy | `client/src/fl/DifferentialPrivacy.ts` planned module and FL testing criteria. |
| Controlled scenario validation | `ml/validation/synthetic_scenarios/` and `tests/e2e/`. |
| Performance and bandwidth analysis | `docs/testing/TESTING_STRATEGY.md` and `tests/network/`. |

## Implementation Implications

- Phase 1 should prove one full path end-to-end before all channels are implemented.
- Gaze/pose is the best first channel because it validates webcam capture, worker execution, fusion, IndexedDB, WebRTC, backend ingestion, and database storage.
- Audio/rPPG/AU claims must stay conservative and measurable.
- Network testing is not optional; bandwidth equity is a core project claim.
- Human review is not a side feature. It provides the highest-quality labels for future FL rounds.
