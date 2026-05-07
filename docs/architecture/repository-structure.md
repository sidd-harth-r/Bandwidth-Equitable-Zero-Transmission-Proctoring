# Repository Structure

```text
.
|-- client/
|   |-- src/
|   |   |-- audio/worklets/
|   |   |-- calibration/
|   |   |-- coordinator/
|   |   |-- exam/
|   |   |-- fl/
|   |   |-- network/
|   |   |-- service-worker/
|   |   |-- storage/
|   |   `-- workers/
|   `-- tests/
|-- configs/
|-- docs/
|   |-- architecture/
|   |-- decisions/
|   |-- environment/
|   |-- experiments/
|   |-- implementation/
|   |-- operations/
|   |-- research/
|   `-- testing/
|-- infrastructure/
|   |-- docker/
|   |-- kubernetes/
|   |-- nginx/
|   `-- scripts/
|-- ml/
|   |-- datasets/
|   |-- experiments/notebooks/
|   |-- models/
|   |   |-- baseline_pretrained/
|   |   `-- lstm_anomaly_detector/
|   `-- validation/synthetic_scenarios/
|-- proctor-dashboard/
|   |-- src/
|   |   |-- components/
|   |   |-- services/
|   |   `-- views/
|   `-- tests/
|-- progress/
|   `-- sprint-001/
|-- scripts/
|-- server/
|   |-- src/
|   |   |-- api/
|   |   |   |-- middleware/
|   |   |   `-- routes/
|   |   |-- db/migrations/
|   |   |-- fl/
|   |   |-- models/
|   |   |   |-- database/
|   |   |   `-- pydantic/
|   |   `-- services/
|   `-- tests/
`-- tests/
    |-- e2e/
    |-- network/
    `-- privacy/
```

Empty implementation directories contain `.gitkeep` placeholders until real source files are added.
