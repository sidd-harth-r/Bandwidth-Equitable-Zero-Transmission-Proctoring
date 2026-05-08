import type { SignalingTransport } from "./WebRtcSignaling";

interface SessionIds {
  sessionId: string;
  studentId: string;
  proctorId: string;
}

export interface LoopbackHandle {
  stop(): void;
  getDiagnostics(): {
    offerApplied: boolean;
    answerQueued: boolean;
    errors: string[];
  };
}

export function startLocalProctorLoopback(
  signaling: SignalingTransport,
  ids: SessionIds
): LoopbackHandle {
  const peer = new RTCPeerConnection({
    iceServers: []
  });
  let running = true;
  let offerApplied = false;
  let answerQueued = false;
  const errors: string[] = [];
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
    void pumpSignals().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message);
    });
  }, 300);

  async function pumpSignals(): Promise<void> {
    if (!running) {
      return;
    }

    if (!offerApplied) {
      const offerSignal = await signaling.dequeueSignal(ids.sessionId, ids.proctorId, "offer");
      if (offerSignal) {
        try {
          const offer = JSON.parse(offerSignal.payload) as RTCSessionDescriptionInit;
          await peer.setRemoteDescription(offer);
          offerApplied = true;
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          await waitForIceGatheringComplete(peer);
          const localDescription = peer.localDescription;
          if (!localDescription) {
            throw new Error("loopback_local_description_missing_after_answer");
          }
          await signaling.enqueueSignal({
            session_id: ids.sessionId,
            sender_id: ids.proctorId,
            target_id: ids.studentId,
            signal_type: "answer",
            payload: JSON.stringify(localDescription)
          });
          answerQueued = true;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          errors.push(`loopback_offer_apply_or_answer_failed:${message}`);
        }
      }
    }

    if (offerApplied) {
      for (let i = 0; i < 5; i += 1) {
        const candidateSignal = await signaling.dequeueSignal(
          ids.sessionId,
          ids.proctorId,
          "ice_candidate"
        );
        if (!candidateSignal) {
          break;
        }
        try {
          const candidate = JSON.parse(candidateSignal.payload) as RTCIceCandidateInit;
          await peer.addIceCandidate(candidate);
        } catch {
          // Ignore malformed or premature candidates in loopback mode.
        }
      }
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
    },
    getDiagnostics() {
      return {
        offerApplied,
        answerQueued,
        errors: [...errors]
      };
    }
  };
}

async function waitForIceGatheringComplete(peer: RTCPeerConnection): Promise<void> {
  if (peer.iceGatheringState === "complete") {
    return;
  }
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      peer.removeEventListener("icegatheringstatechange", onStateChange);
      resolve();
    };
    const onStateChange = () => {
      if (peer.iceGatheringState === "complete") {
        finish();
      }
    };
    peer.addEventListener("icegatheringstatechange", onStateChange);
    setTimeout(finish, 2500);
  });
}
