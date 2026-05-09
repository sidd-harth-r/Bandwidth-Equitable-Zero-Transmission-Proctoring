import type { Gear } from "../coordinator/types";
import type { NetworkTelemetry } from "./TelemetryCollector";

export class GearStateMachine {
  private currentGear: Gear = "gear_1";
  
  // 10-second rolling buffers
  private rttBuffer: number[] = [];
  private plrBuffer: number[] = [];
  private readonly BUFFER_SIZE = 10;

  // Hysteresis counters
  // UPGRADE (e.g., Gear 3 -> Gear 2): conservative. Require 3 consecutive good samples.
  private consecutiveGoodSamples = 0;
  // DOWNGRADE (e.g., Gear 2 -> Gear 3): aggressive. Require 2 consecutive bad samples.
  private consecutiveBadSamples = 0;

  private gear4StartTime: number | null = null;
  private readonly GEAR_4_SUSPEND_MS = 300_000; // 300 seconds

  private onGearChange: ((gear: Gear, triggeredByRtt: number, triggeredByPlr: number) => void) | null = null;
  private onSuspend: (() => void) | null = null;

  constructor(
    onGearChange?: (gear: Gear, triggeredByRtt: number, triggeredByPlr: number) => void,
    onSuspend?: () => void
  ) {
    if (onGearChange) this.onGearChange = onGearChange;
    if (onSuspend) this.onSuspend = onSuspend;

    // Listen to telemetry events
    window.addEventListener("webrtc-telemetry", this.handleTelemetry as EventListener);
  }

  public destroy() {
    window.removeEventListener("webrtc-telemetry", this.handleTelemetry as EventListener);
  }

  public getCurrentGear(): Gear {
    return this.currentGear;
  }

  private handleTelemetry = (e: CustomEvent<NetworkTelemetry>) => {
    const { rttMs, plr } = e.detail;

    // 1. Update rolling buffers
    this.rttBuffer.push(rttMs);
    if (this.rttBuffer.length > this.BUFFER_SIZE) {
      this.rttBuffer.shift();
    }

    this.plrBuffer.push(plr);
    if (this.plrBuffer.length > this.BUFFER_SIZE) {
      this.plrBuffer.shift();
    }

    // Wait until we have at least 1 sample, but preferably evaluate on whatever we have
    if (this.rttBuffer.length === 0) return;

    // 2. Compute 10-second rolling averages
    const avgRtt = this.rttBuffer.reduce((a, b) => a + b, 0) / this.rttBuffer.length;
    const avgPlr = this.plrBuffer.reduce((a, b) => a + b, 0) / this.plrBuffer.length;

    // 3. Determine instantaneous target gear based on exact thresholds
    const targetGear = this.evaluateThresholds(avgRtt, avgPlr);

    // 4. Apply hysteresis
    this.applyHysteresis(targetGear, avgRtt, avgPlr);

    // 5. Evaluate Gear 4 timer
    this.evaluateGear4Timer();
  };

  private evaluateThresholds(avgRtt: number, avgPlr: number): Gear {
    // Gear 4: RTT >= 500ms OR PLR >= 0.05
    if (avgRtt >= 500 || avgPlr >= 0.05) return "gear_4";
    // Gear 3: RTT < 500ms AND PLR < 0.05 (implied by previous check) AND (RTT >= 150 OR PLR >= 0.02)
    if (avgRtt >= 150 || avgPlr >= 0.02) return "gear_3";
    // Gear 2: RTT < 150ms AND PLR < 0.02 AND (RTT >= 50 OR PLR >= 0.005)
    if (avgRtt >= 50 || avgPlr >= 0.005) return "gear_2";
    // Gear 1: RTT < 50ms AND PLR < 0.005
    return "gear_1";
  }

  private applyHysteresis(targetGear: Gear, avgRtt: number, avgPlr: number) {
    const targetVal = this.gearToNumber(targetGear);
    const currentVal = this.gearToNumber(this.currentGear);

    if (targetVal === currentVal) {
      // Stable
      this.consecutiveGoodSamples = 0;
      this.consecutiveBadSamples = 0;
    } else if (targetVal > currentVal) {
      // Downgrade (worse conditions)
      this.consecutiveGoodSamples = 0;
      this.consecutiveBadSamples++;
      if (this.consecutiveBadSamples >= 2) {
        this.transitionTo(targetGear, avgRtt, avgPlr);
      }
    } else {
      // Upgrade (better conditions)
      this.consecutiveBadSamples = 0;
      this.consecutiveGoodSamples++;
      if (this.consecutiveGoodSamples >= 3) {
        this.transitionTo(targetGear, avgRtt, avgPlr);
      }
    }
  }

  private transitionTo(newGear: Gear, avgRtt: number, avgPlr: number) {
    this.currentGear = newGear;
    this.consecutiveGoodSamples = 0;
    this.consecutiveBadSamples = 0;

    // Handle Gear 4 timer start/stop
    if (newGear === "gear_4") {
      if (this.gear4StartTime === null) {
        this.gear4StartTime = Date.now();
      }
    } else {
      this.gear4StartTime = null;
    }

    if (this.onGearChange) {
      this.onGearChange(newGear, avgRtt, avgPlr);
    }
  }

  private evaluateGear4Timer() {
    if (this.currentGear === "gear_4" && this.gear4StartTime !== null) {
      const elapsed = Date.now() - this.gear4StartTime;
      if (elapsed >= this.GEAR_4_SUSPEND_MS) {
        // Emit suspend event, stop timer so we don't emit multiple times
        this.gear4StartTime = null;
        if (this.onSuspend) {
          this.onSuspend();
        }
      }
    }
  }

  private gearToNumber(g: Gear): number {
    switch (g) {
      case "gear_1": return 1;
      case "gear_2": return 2;
      case "gear_3": return 3;
      case "gear_4": return 4;
      default: return 1;
    }
  }
}
