import type { PeerConnectionLike } from "./WebRtcSignaling";

export interface NetworkTelemetry {
  rttMs: number;
  plr: number;
  jitterMs: number;
}

export interface TelemetryBatchEntry extends NetworkTelemetry {
  timestamp: string;
  gear: string;
}

export class TelemetryCollector {
  private peer: PeerConnectionLike;
  private intervalId: number | null = null;
  private lastPacketsSent: number | null = null;
  private lastPacketsLost: number | null = null;

  private batch: TelemetryBatchEntry[] = [];
  private onBatchReady: ((batch: TelemetryBatchEntry[]) => void) | null = null;

  // We expose the current gear so it can be stamped on entries
  private currentGear: string = "gear_1";

  constructor(peer: PeerConnectionLike) {
    this.peer = peer;
  }

  public setGear(gear: string) {
    this.currentGear = gear;
  }

  public setBatchCallback(callback: (batch: TelemetryBatchEntry[]) => void) {
    this.onBatchReady = callback;
  }

  public start() {
    if (this.intervalId !== null) return;
    this.intervalId = window.setInterval(() => this.collectStats(), 1000);
  }

  public stop() {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async collectStats() {
    if (this.peer.connectionState !== "connected" && this.peer.connectionState !== "completed") {
      // Don't collect stats if we're not fully connected
      return;
    }

    try {
      const stats = await this.peer.getStats();
      let rtt = 0;
      let currentPacketsSent = 0;
      let currentPacketsLost = 0;
      let jitter = 0;

      stats.forEach((report) => {
        if (report.type === "candidate-pair" && report.nominated && report.state === "succeeded") {
          // currentRoundTripTime is in seconds, convert to ms
          if (report.currentRoundTripTime !== undefined) {
            rtt = report.currentRoundTripTime * 1000;
          }
        }
        if (report.type === "remote-inbound-rtp") {
          if (report.jitter !== undefined) {
            jitter = report.jitter * 1000;
          }
          if (report.packetsLost !== undefined) {
            currentPacketsLost = report.packetsLost;
          }
        }
        if (report.type === "outbound-rtp") {
          if (report.packetsSent !== undefined) {
            currentPacketsSent = report.packetsSent;
          }
        }
      });

      let plr = 0;

      // Handle first sample
      if (this.lastPacketsSent === null || this.lastPacketsLost === null) {
        this.lastPacketsSent = currentPacketsSent;
        this.lastPacketsLost = currentPacketsLost;
      } else {
        let deltaLost = currentPacketsLost - this.lastPacketsLost;
        // Clamp decreasing packetsLost to zero
        if (deltaLost < 0) deltaLost = 0;

        const deltaSent = currentPacketsSent - this.lastPacketsSent;
        
        plr = deltaSent > 0 ? deltaLost / deltaSent : 0;

        this.lastPacketsSent = currentPacketsSent;
        this.lastPacketsLost = currentPacketsLost;
      }

      const telemetry: NetworkTelemetry = { rttMs: rtt, plr, jitterMs: jitter };
      
      // Dispatch event or callback for the GearStateMachine
      this.dispatchTelemetry(telemetry);

    } catch (err) {
      console.warn("Failed to collect WebRTC stats", err);
    }
  }

  private dispatchTelemetry(telemetry: NetworkTelemetry) {
    // Fire a custom event for the state machine
    const event = new CustomEvent("webrtc-telemetry", { detail: telemetry });
    window.dispatchEvent(event);

    // Batching logic
    this.batch.push({
      ...telemetry,
      timestamp: new Date().toISOString(),
      gear: this.currentGear
    });

    if (this.batch.length >= 30) {
      if (this.onBatchReady) {
        this.onBatchReady([...this.batch]);
      }
      this.batch = [];
    }
  }
}
