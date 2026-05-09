// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GearStateMachine } from '../src/network/GearStateMachine';

describe('GearStateMachine', () => {
  let gearStateMachine: GearStateMachine;
  let onGearChange: ReturnType<typeof vi.fn>;
  let onSuspend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    onGearChange = vi.fn();
    onSuspend = vi.fn();
    gearStateMachine = new GearStateMachine(onGearChange, onSuspend);
  });

  afterEach(() => {
    gearStateMachine.destroy();
    vi.useRealTimers();
  });

  const sendTelemetry = (rttMs: number, plr: number) => {
    window.dispatchEvent(
      new CustomEvent('webrtc-telemetry', {
        detail: { rttMs, plr, jitterMs: 0 },
      })
    );
  };

  it('initializes in gear_1', () => {
    expect(gearStateMachine.getCurrentGear()).toBe('gear_1');
  });

  it('downgrades to gear_2 after 2 bad samples', () => {
    // gear_2 threshold: RTT >= 50 or PLR >= 0.005
    sendTelemetry(60, 0); // Sample 1
    expect(gearStateMachine.getCurrentGear()).toBe('gear_1');
    expect(onGearChange).not.toHaveBeenCalled();

    sendTelemetry(60, 0); // Sample 2
    expect(gearStateMachine.getCurrentGear()).toBe('gear_2');
    expect(onGearChange).toHaveBeenCalledWith('gear_2', 60, 0);
  });

  it('does not downgrade on 1 bad sample', () => {
    sendTelemetry(60, 0); // Sample 1
    expect(gearStateMachine.getCurrentGear()).toBe('gear_1');
    
    sendTelemetry(30, 0); // Back to good
    expect(gearStateMachine.getCurrentGear()).toBe('gear_1');
    
    sendTelemetry(60, 0); // Sample 1 again
    expect(gearStateMachine.getCurrentGear()).toBe('gear_1');
    expect(onGearChange).not.toHaveBeenCalled();
  });

  it('upgrades to gear_1 after 3 good samples', () => {
    // First, force downgrade to gear_2
    sendTelemetry(60, 0);
    sendTelemetry(60, 0);
    expect(gearStateMachine.getCurrentGear()).toBe('gear_2');

    // Now send good samples
    sendTelemetry(20, 0); // Sample 1
    expect(gearStateMachine.getCurrentGear()).toBe('gear_2');

    sendTelemetry(20, 0); // Sample 2
    expect(gearStateMachine.getCurrentGear()).toBe('gear_2');

    sendTelemetry(20, 0); // Sample 3
    expect(gearStateMachine.getCurrentGear()).toBe('gear_1');
    
    // avgRtt: (60+60+20+20+20)/5 = 36
    // gear_1 condition RTT < 50, PLR < 0.005
  });

  it('evaluates boundary conditions correctly (PLR exactly threshold)', () => {
    // Gear 4 PLR threshold is 0.05
    // Send 2 samples of PLR 0.05
    sendTelemetry(20, 0.05);
    sendTelemetry(20, 0.05);
    
    expect(gearStateMachine.getCurrentGear()).toBe('gear_4');
  });

  it('suspends after 300 seconds in Gear 4', () => {
    // Downgrade to gear 4
    sendTelemetry(600, 0);
    sendTelemetry(600, 0);
    expect(gearStateMachine.getCurrentGear()).toBe('gear_4');

    // Advance 299 seconds
    vi.advanceTimersByTime(299_000);
    // Send telemetry to trigger evaluation
    sendTelemetry(600, 0);
    expect(onSuspend).not.toHaveBeenCalled();

    // Advance 1 second (300 total)
    vi.advanceTimersByTime(1_000);
    sendTelemetry(600, 0);
    expect(onSuspend).toHaveBeenCalledTimes(1);
    
    // Further samples should not trigger suspend again
    vi.advanceTimersByTime(1_000);
    sendTelemetry(600, 0);
    expect(onSuspend).toHaveBeenCalledTimes(1);
  });

  it('resets suspension timer if upgraded from Gear 4 before 300s', () => {
    // Downgrade to gear 4
    sendTelemetry(600, 0);
    sendTelemetry(600, 0);
    expect(gearStateMachine.getCurrentGear()).toBe('gear_4');

    vi.advanceTimersByTime(100_000);

    // Upgrade to gear 3
    sendTelemetry(200, 0);
    sendTelemetry(200, 0);
    sendTelemetry(200, 0);
    sendTelemetry(200, 0); // 4 good samples to overwhelm the rolling average
    sendTelemetry(200, 0);
    sendTelemetry(200, 0);
    sendTelemetry(200, 0);
    sendTelemetry(200, 0); // 8
    
    expect(gearStateMachine.getCurrentGear()).toBe('gear_3');

    // Downgrade back to gear 4 (need to overpower the 200ms average)
    sendTelemetry(2000, 0); // Avg 420 (gear 3)
    sendTelemetry(2000, 0); // Avg 560 (gear 4) - bad sample 1
    sendTelemetry(2000, 0); // Avg 740 (gear 4) - bad sample 2 -> downgrades
    expect(gearStateMachine.getCurrentGear()).toBe('gear_4');

    // Advance 200 seconds (total 300 since first gear 4, but 200 since second)
    vi.advanceTimersByTime(200_000);
    sendTelemetry(600, 0);
    expect(onSuspend).not.toHaveBeenCalled(); // Timer was reset
  });
});
