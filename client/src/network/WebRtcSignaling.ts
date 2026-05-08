import type { SignalEnvelope } from "./SignalingClient";

export interface PeerConnectionLike {
  localDescription: RTCSessionDescription | null;
  createOffer(): Promise<RTCSessionDescriptionInit>;
  setLocalDescription(description: RTCSessionDescriptionInit): Promise<void>;
  setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void>;
  close(): void;
  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null;
}

export interface WebRtcSession {
  peer: PeerConnectionLike;
  waitForAnswer: Promise<boolean>;
}

interface SessionIds {
  sessionId: string;
  studentId: string;
  proctorId: string;
}

export interface SignalingTransport {
  enqueueSignal(signal: SignalEnvelope): Promise<unknown>;
  dequeueSignal(
    sessionId: string,
    targetId: string,
    signalType: "offer" | "answer" | "ice_candidate"
  ): Promise<SignalEnvelope | null>;
}

export async function startWebRtcSignaling(
  signaling: SignalingTransport,
  ids: SessionIds,
  peer: PeerConnectionLike = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  })
): Promise<WebRtcSession> {
  peer.onicecandidate = (event) => {
    if (!event.candidate) {
      return;
    }
    void signaling.enqueueSignal({
      session_id: ids.sessionId,
      sender_id: ids.studentId,
      target_id: ids.proctorId,
      signal_type: "ice_candidate",
      payload: JSON.stringify(event.candidate.toJSON())
    });
  };

  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  const localDescription = peer.localDescription;
  if (!localDescription) {
    throw new Error("RTCPeerConnection local description missing after offer creation.");
  }

  await signaling.enqueueSignal({
    session_id: ids.sessionId,
    sender_id: ids.studentId,
    target_id: ids.proctorId,
    signal_type: "offer",
    payload: JSON.stringify(localDescription)
  });

  return {
    peer,
    waitForAnswer: waitForAnswer(signaling, ids, peer)
  };
}

async function waitForAnswer(
  signaling: SignalingTransport,
  ids: SessionIds,
  peer: PeerConnectionLike
): Promise<boolean> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const signal = await signaling.dequeueSignal(ids.sessionId, ids.studentId, "answer");
    if (!signal) {
      await delay(600);
      continue;
    }
    await applyRemoteAnswer(peer, signal);
    return true;
  }
  return false;
}

async function applyRemoteAnswer(peer: PeerConnectionLike, signal: SignalEnvelope): Promise<void> {
  const answer = JSON.parse(signal.payload) as RTCSessionDescriptionInit;
  await peer.setRemoteDescription(answer);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
