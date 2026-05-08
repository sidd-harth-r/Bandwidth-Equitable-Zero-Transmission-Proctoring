import type { SignalingTransport } from "./WebRtcSignaling";

interface SessionIds {
  sessionId: string;
  studentId: string;
  proctorId: string;
}

export interface LoopbackHandle {
  stop(): void;
}

export function startLocalProctorLoopback(
  signaling: SignalingTransport,
  ids: SessionIds
): LoopbackHandle {
  const peer = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });
  let running = true;
  let offerApplied = false;
  let timer: ReturnType<typeof setInterval> | undefined;

  peer.onicecandidate = (event) => {
    if (!event.candidate) {
      return;
    }
    void signaling.enqueueSignal({
      session_id: ids.sessionId,
      sender_id: ids.proctorId,
      target_id: ids.studentId,
      signal_type: "ice_candidate",
      payload: JSON.stringify(event.candidate.toJSON())
    });
  };

  peer.ondatachannel = (event) => {
    const channel = event.channel;
    channel.onmessage = () => {
      // Loopback peer consumes messages only to keep the DataChannel open path testable.
    };
  };

  timer = setInterval(() => {
    void pumpSignals();
  }, 300);

  async function pumpSignals(): Promise<void> {
    if (!running) {
      return;
    }

    if (!offerApplied) {
      const offerSignal = await signaling.dequeueSignal(ids.sessionId, ids.proctorId, "offer");
      if (offerSignal) {
        const offer = JSON.parse(offerSignal.payload) as RTCSessionDescriptionInit;
        await peer.setRemoteDescription(offer);
        offerApplied = true;
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        await signaling.enqueueSignal({
          session_id: ids.sessionId,
          sender_id: ids.proctorId,
          target_id: ids.studentId,
          signal_type: "answer",
          payload: JSON.stringify(answer)
        });
      }
    }

    const candidateSignal = await signaling.dequeueSignal(ids.sessionId, ids.proctorId, "ice_candidate");
    if (candidateSignal) {
      const candidate = JSON.parse(candidateSignal.payload) as RTCIceCandidateInit;
      await peer.addIceCandidate(candidate);
    }
  }

  return {
    stop() {
      running = false;
      if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
      peer.close();
    }
  };
}
