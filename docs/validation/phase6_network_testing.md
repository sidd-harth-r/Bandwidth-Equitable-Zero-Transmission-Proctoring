# Phase 6: Network Validation Methodology

To guarantee bandwidth equity and prove that the 4-Gear system prevents student dropouts under severe network stress, we must perform empirical packet-level validation.

Since network shaping requires OS-level permissions and real browser execution, this document outlines the exact methodology to be performed using **Clumsy** (Windows) and **Wireshark**.

## Prerequisites
1. Run the local BEZP server and client.
2. Install [Clumsy](https://jagt.github.io/clumsy/).
3. Install [Wireshark](https://www.wireshark.org/).

## Test Scenarios (S1 - S4)

### Setup
1. Open Wireshark and begin capturing on the Loopback interface (or whichever interface connects client and server).
2. Filter the capture by the BEZP server port: `tcp.port == 8000 || udp.port == 8000` (for WebRTC).
3. Open the BEZP client in Chrome and start a proctoring session.

### S1: Baseline (Gear 1)
1. **Clumsy Configuration**: Disabled. (RTT ~ 20ms, PLR ~ 0.1%).
2. **Execution**: Run for 60 seconds.
3. **Verification**: 
   - Dashboard shows Gear 1.
   - All channels (Pose/Gaze, rPPG, AU, Keystroke) are active at 10 FPS.
   - Wireshark shows steady stream of WebRTC stats and anomaly scores.

### S2: Minor Degradation (Gear 2)
1. **Clumsy Configuration**:
   - Lag: `50ms` (Inbound & Outbound) -> Total RTT ~ 100ms.
   - Drop: `1.0%`.
2. **Execution**: Run for 60 seconds.
3. **Verification**:
   - Dashboard transitions to Gear 2.
   - Target FPS drops to 5.
   - Wireshark shows reduced packet frequency corresponding to 5 FPS.

### S3: Severe Degradation (Gear 3)
1. **Clumsy Configuration**:
   - Lag: `100ms` (Inbound & Outbound) -> Total RTT ~ 200ms.
   - Drop: `3.0%`.
2. **Execution**: Run for 60 seconds.
3. **Verification**:
   - Dashboard transitions to Gear 3.
   - Target FPS drops to 2.
   - **Crucial**: rPPG and AU channels are completely disabled.
   - Quantisation is enabled.
   - Wireshark shows a significant drop in payload size and frequency.

### S4: Critical Degradation (Gear 4)
1. **Clumsy Configuration**:
   - Lag: `250ms` (Inbound & Outbound) -> Total RTT ~ 500ms.
   - Drop: `10.0%`.
2. **Execution**: Run for 290 seconds (do not exceed 300s yet).
3. **Verification**:
   - Dashboard transitions to Gear 4.
   - Target FPS drops to 1.
   - Local inference (`FlModelWorker`) is disabled.
   - Wireshark shows anomaly scores being sent, but if the connection fully drops, the Service Worker intercepts them.

### Gear 4 Suspension Timer
1. Leave Clumsy running the S4 configuration.
2. Wait until the 300-second mark is reached in Gear 4.
3. **Verification**:
   - Client triggers `EXAM_SUSPEND`.
   - UI locks.
   - Server registers suspension.

### Connectivity Recovery
1. **Clumsy Configuration**: Drop: `100.0%` (Complete outage).
2. **Execution**:
   - Trigger several tier-1 alerts (e.g., look away from screen).
   - Wait 120 seconds.
3. **Recovery**:
   - Disable Clumsy (Restore connection).
4. **Verification**:
   - Background Sync or `fetch` fallback flushes the Service Worker queues.
   - Wireshark shows a burst of stored anomaly scores arriving at the server.
   - Database verifies the anomaly scores retained their *original* timestamps, not the timestamp of recovery.

## Documentation
Save the resulting `.pcap` files from Wireshark into `docs/validation/captures/` with names `S1_baseline.pcap`, `S2_minor.pcap`, `S3_severe.pcap`, `S4_critical.pcap`, and `recovery.pcap`.
