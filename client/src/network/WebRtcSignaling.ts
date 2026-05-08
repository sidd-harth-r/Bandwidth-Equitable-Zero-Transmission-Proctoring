import type { SignalEnvelope } from "./SignalingClient";
import type { AnomalyScorePayload } from "../coordinator/types";

export interface DataChannelLike {
  readyState: "connecting" | "open" | "closing" | "closed";
  send(data: string): void;
}

export interface PeerConnectionLike {
  localDescription: RTCSessionDescription | null;
  createOffer(): Promise<RTCSessionDescriptionInit>;
  setLocalDescription(description: RTCSessionDescriptionInit): Promise<void>;
  setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void>;
  addIceCandidate(candidate: RTCIceCandidateInit): Promise<void>;
  createDataChannel(label: string, options?: RTCDataChannelInit): DataChannelLike;
  close(): void;
  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null;
}

export interface WebRtcSession {
  peer: PeerConnectionLike;
  dataChannel: DataChannelLike;
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
  const dataChannel = peer.createDataChannel("anomaly-scores", {
    ordered: false,
    maxRetransmits: 0
  });

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
    dataChannel,
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
    await ingestRemoteIce(signaling, ids, peer);
    return true;
  }
  return false;
}

async function applyRemoteAnswer(peer: PeerConnectionLike, signal: SignalEnvelope): Promise<void> {
  const answer = JSON.parse(signal.payload) as RTCSessionDescriptionInit;
  await peer.setRemoteDescription(answer);
}

async function ingestRemoteIce(
  signaling: SignalingTransport,
  ids: SessionIds,
  peer: PeerConnectionLike
): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const signal = await signaling.dequeueSignal(ids.sessionId, ids.studentId, "ice_candidate");
    if (!signal) {
      await delay(250);
      continue;
    }
    try {
      const candidate = JSON.parse(signal.payload) as RTCIceCandidateInit;
      await peer.addIceCandidate(candidate);
    } catch {
      return;
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function sendAnomalyScoreOverDataChannel(
  dataChannel: DataChannelLike,
  payload: AnomalyScorePayload
): boolean {
  if (dataChannel.readyState !== "open") {
    return false;
  }
  dataChannel.send(JSON.stringify(payload));
  return true;
}
