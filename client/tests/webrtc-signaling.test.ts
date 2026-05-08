import { describe, expect, it, vi } from "vitest";

import type { SignalEnvelope } from "../src/network/SignalingClient";
import { startWebRtcSignaling } from "../src/network/WebRtcSignaling";

class FakePeer {
  localDescription: RTCSessionDescription | null = null;
  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  closed = false;

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: "offer", sdp: "fake-offer" };
  }

  async setLocalDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = description as RTCSessionDescription;
  }

  async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = description;
  }

  close(): void {
    this.closed = true;
  }
}

describe("startWebRtcSignaling", () => {
  it("creates and enqueues an offer", async () => {
    const enqueueSignal = vi.fn().mockResolvedValue({ status: "queued", channel: "channel" });
    const dequeueSignal = vi
      .fn()
      .mockResolvedValueOnce({
        session_id: "session-1",
        sender_id: "proctor-1",
        target_id: "student-1",
        signal_type: "answer",
        payload: JSON.stringify({ type: "answer", sdp: "fake-answer" })
      } satisfies SignalEnvelope)
      .mockResolvedValueOnce(null);
    const signaling = { enqueueSignal, dequeueSignal };
    const peer = new FakePeer();

    const session = await startWebRtcSignaling(
      signaling,
      { sessionId: "session-1", studentId: "student-1", proctorId: "proctor-1" },
      peer
    );
    const answered = await session.waitForAnswer;

    expect(answered).toBe(true);
    expect(enqueueSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        signal_type: "offer"
      })
    );
    expect(peer.remoteDescription).toEqual({ type: "answer", sdp: "fake-answer" });
  });

  it("returns false if no answer arrives during polling window", async () => {
    const enqueueSignal = vi.fn().mockResolvedValue({ status: "queued", channel: "channel" });
    const dequeueSignal = vi.fn().mockResolvedValue(null);
    const signaling = { enqueueSignal, dequeueSignal };
    const peer = new FakePeer();
    vi.useFakeTimers();

    const session = await startWebRtcSignaling(
      signaling,
      { sessionId: "session-2", studentId: "student-2", proctorId: "proctor-2" },
      peer
    );
    const pending = session.waitForAnswer;
    await vi.runAllTimersAsync();
    const answered = await pending;

    expect(answered).toBe(false);
    expect(dequeueSignal).toHaveBeenCalledTimes(5);
    vi.useRealTimers();
  });
});
