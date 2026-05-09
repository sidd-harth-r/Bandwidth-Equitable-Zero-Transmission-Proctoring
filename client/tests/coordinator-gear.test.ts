// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Coordinator } from '../src/coordinator/Coordinator';

describe('Coordinator — Gear State Machine Integration', () => {
  let postMessageMock: ReturnType<typeof vi.fn>;
  let OriginalWorker: typeof Worker;

  beforeEach(() => {
    postMessageMock = vi.fn();
    OriginalWorker = global.Worker;
    
    // Mock Web Worker
    global.Worker = class {
      onmessage: any;
      onerror: any;
      postMessage = postMessageMock;
      terminate = vi.fn();
      addEventListener = vi.fn();
      removeEventListener = vi.fn();
      dispatchEvent = vi.fn();
    } as any;
  });

  afterEach(() => {
    global.Worker = OriginalWorker;
    vi.clearAllMocks();
  });

  it('broadcasts gear_1 config on startup', () => {
    const coordinator = new Coordinator(
      { gear: 'gear_1', weights: {}, thresholds: {} as any },
      { onAnomaly: vi.fn(), onTierChange: vi.fn(), onError: vi.fn() }
    );

    coordinator.start();

    // Verify GEAR_CONFIG was posted to workers (should be posted 5 times, once per worker)
    const gearConfigCalls = postMessageMock.mock.calls.filter(
      (call) => call[0] && call[0].type === 'GEAR_CONFIG'
    );

    expect(gearConfigCalls.length).toBe(5); // pose, rppg, au, keystroke, flmodel
    expect(gearConfigCalls[0][0]).toEqual({
      type: 'GEAR_CONFIG',
      gear: 'gear_1',
      targetFps: 10,
      activeChannels: { pose_gaze: true, rppg: true, au: true, keystroke: true },
      useQuantization: false
    });

    coordinator.stop();
  });

  it('broadcasts updated config when GearStateMachine triggers gear change', () => {
    const coordinator = new Coordinator(
      { gear: 'gear_1', weights: {}, thresholds: {} as any },
      { onAnomaly: vi.fn(), onTierChange: vi.fn(), onError: vi.fn() }
    );

    coordinator.start();
    postMessageMock.mockClear();

    // Trigger gear_4 transition by sending telemetry
    window.dispatchEvent(
      new CustomEvent('webrtc-telemetry', {
        detail: { rttMs: 600, plr: 0, jitterMs: 0 },
      })
    );
    window.dispatchEvent(
      new CustomEvent('webrtc-telemetry', {
        detail: { rttMs: 600, plr: 0, jitterMs: 0 },
      })
    );

    // Verify GEAR_CONFIG was posted to workers (5 workers)
    const gearConfigCalls = postMessageMock.mock.calls.filter(
      (call) => call[0] && call[0].type === 'GEAR_CONFIG'
    );
    expect(gearConfigCalls.length).toBe(5);

    expect(gearConfigCalls[0][0]).toEqual({
      type: 'GEAR_CONFIG',
      gear: 'gear_4',
      targetFps: 1, // Gear 4 throttles to 1 FPS
      activeChannels: { pose_gaze: true, rppg: false, au: false, keystroke: true }, // rPPG and AU disabled
      useQuantization: true
    });

    coordinator.stop();
  });

  describe('Integration S-Tests', () => {
    let coordinator: Coordinator;

    beforeEach(() => {
      coordinator = new Coordinator(
        { gear: 'gear_1', weights: {}, thresholds: {} as any },
        { onAnomaly: vi.fn(), onTierChange: vi.fn(), onError: vi.fn() }
      );
      coordinator.start();
      postMessageMock.mockClear();
    });

    afterEach(() => {
      coordinator.stop();
    });

    it('S1: RTT 20ms, PLR 0.1% — verify Gear 1, all channels active, 10 FPS', () => {
      // Send 3 good samples to lock in gear 1 (already in gear 1)
      for (let i = 0; i < 3; i++) {
        window.dispatchEvent(
          new CustomEvent('webrtc-telemetry', {
            detail: { rttMs: 20, plr: 0.001, jitterMs: 0 },
          })
        );
      }

      const gearConfigCalls = postMessageMock.mock.calls.filter(c => c[0] && c[0].type === 'GEAR_CONFIG');
      // No transition occurred because we are already in Gear 1, 
      // and mock was cleared after initial broadcast
      expect(gearConfigCalls.length).toBe(0);
    });

    it('S2: RTT 100ms, PLR 1% — verify Gear 2, reduced FPS', () => {
      // Downgrade to gear 2 requires 2 samples
      for (let i = 0; i < 2; i++) {
        window.dispatchEvent(
          new CustomEvent('webrtc-telemetry', {
            detail: { rttMs: 100, plr: 0.01, jitterMs: 0 },
          })
        );
      }

      const gearConfigCalls = postMessageMock.mock.calls.filter(c => c[0] && c[0].type === 'GEAR_CONFIG');
      const latestConfig = gearConfigCalls[gearConfigCalls.length - 1][0];

      expect(latestConfig.gear).toBe('gear_2');
      expect(latestConfig.targetFps).toBe(5); // reduced FPS
      expect(latestConfig.activeChannels).toEqual({ pose_gaze: true, rppg: true, au: true, keystroke: true });
    });

    it('S3: RTT 200ms, PLR 3% — verify Gear 3, 2 FPS, quantisation active, rPPG/AU disabled', () => {
      // Downgrade to gear 3 requires 2 samples
      for (let i = 0; i < 2; i++) {
        window.dispatchEvent(
          new CustomEvent('webrtc-telemetry', {
            detail: { rttMs: 200, plr: 0.03, jitterMs: 0 },
          })
        );
      }

      const gearConfigCalls = postMessageMock.mock.calls.filter(c => c[0] && c[0].type === 'GEAR_CONFIG');
      const latestConfig = gearConfigCalls[gearConfigCalls.length - 1][0];

      expect(latestConfig.gear).toBe('gear_3');
      expect(latestConfig.targetFps).toBe(2);
      expect(latestConfig.useQuantization).toBe(true);
      expect(latestConfig.activeChannels.rppg).toBe(false);
      expect(latestConfig.activeChannels.au).toBe(false);
    });

    it('S4: RTT 500ms, PLR 10% — verify Gear 4, exam continues, 1 FPS', () => {
      // Downgrade to gear 4 requires 2 samples
      for (let i = 0; i < 2; i++) {
        window.dispatchEvent(
          new CustomEvent('webrtc-telemetry', {
            detail: { rttMs: 500, plr: 0.10, jitterMs: 0 },
          })
        );
      }

      const gearConfigCalls = postMessageMock.mock.calls.filter(c => c[0] && c[0].type === 'GEAR_CONFIG');
      const latestConfig = gearConfigCalls[gearConfigCalls.length - 1][0];

      expect(latestConfig.gear).toBe('gear_4');
      expect(latestConfig.targetFps).toBe(1);
      expect(latestConfig.useQuantization).toBe(true);
      expect(latestConfig.activeChannels.rppg).toBe(false);
      expect(latestConfig.activeChannels.au).toBe(false);
    });
  });
});
