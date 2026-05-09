import type { SignalEnvelope } from "./SignalingClient";
import type { AnomalyScorePayload } from "../coordinator/types";
import { TelemetryCollector } from "./TelemetryCollector";

export interface DataChannelLike {
  readyState: "connecting" | "open" | "closing" | "closed";
  send(data: string): void;
}

export interface PeerConnectionLike {
  localDescription: RTCSessionDescription | null;
  connectionState: RTCPeerConnectionState;
  createOffer(): Promise<RTCSessionDescriptionInit>;
  setLocalDescription(description: RTCSessionDescriptionInit): Promise<void>;
  setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void>;
  addIceCandidate(candidate: RTCIceCandidateInit): Promise<void>;
  createDataChannel(label: string, options?: RTCDataChannelInit): DataChannelLike;
  getStats(selector?: MediaStreamTrack | null): Promise<RTCStatsReport>;
  close(): void;
  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null;
}

export interface WebRtcSession {
  peer: PeerConnectionLike;
  dataChannel: DataChannelLike;
  telemetry: TelemetryCollector;
  waitForAnswer: Promise<boolean>;
  diagnostics: {
    localIceCandidates: number;
    remoteIceCandidates: number;
    answerReceived: boolean;
    answerPayloadSize: number;
    answerParseOk: boolean;
    setRemoteDescriptionError: string | null;
  };
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
    iceServers: []
  })
): Promise<WebRtcSession> {
  const diagnostics = {
    localIceCandidates: 0,
    remoteIceCandidates: 0,
    answerReceived: false,
    answerPayloadSize: 0,
    answerParseOk: false,
    setRemoteDescriptionError: null as string | null
  };
  const dataChannel = peer.createDataChannel("anomaly-scores", {
    ordered: false,
    maxRetransmits: 0
  });

  const telemetry = new TelemetryCollector(peer);
  telemetry.start();

  peer.onicecandidate = (event) => {
    if (!event.candidate) {
      return;
    }
    diagnostics.localIceCandidates += 1;
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
  await waitForIceGatheringComplete(peer);
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
    telemetry,
    waitForAnswer: waitForAnswer(signaling, ids, peer, diagnostics),
    diagnostics
  };
}

async function waitForAnswer(
  signaling: SignalingTransport,
  ids: SessionIds,
  peer: PeerConnectionLike,
  diagnostics: {
    localIceCandidates: number;
    remoteIceCandidates: number;
    answerReceived: boolean;
    answerPayloadSize: number;
    answerParseOk: boolean;
    setRemoteDescriptionError: string | null;
  }
): Promise<boolean> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const signal = await signaling.dequeueSignal(ids.sessionId, ids.studentId, "answer");
    if (!signal) {
      await delay(250);
      continue;
    }
    const applied = await applyRemoteAnswer(peer, signal, diagnostics);
    if (!applied) {
      return false;
    }
    diagnostics.answerReceived = true;
    void ingestRemoteIce(signaling, ids, peer, diagnostics);
    return true;
  }
  return false;
}

async function applyRemoteAnswer(
  peer: PeerConnectionLike,
  signal: SignalEnvelope,
  diagnostics: {
    localIceCandidates: number;
    remoteIceCandidates: number;
    answerReceived: boolean;
    answerPayloadSize: number;
    answerParseOk: boolean;
    setRemoteDescriptionError: string | null;
  }
): Promise<boolean> {
  diagnostics.answerPayloadSize = signal.payload.length;
  let answer: RTCSessionDescriptionInit;
  try {
    answer = JSON.parse(signal.payload) as RTCSessionDescriptionInit;
    diagnostics.answerParseOk = true;
  } catch (error) {
    diagnostics.answerParseOk = false;
    diagnostics.setRemoteDescriptionError =
      error instanceof Error ? `answer_parse_failed:${error.message}` : "answer_parse_failed";
    return false;
  }
  try {
    await peer.setRemoteDescription(answer);
    diagnostics.setRemoteDescriptionError = null;
    return true;
  } catch (error) {
    diagnostics.setRemoteDescriptionError =
      error instanceof Error ? error.message : "set_remote_description_failed";
    return false;
  }
}

async function ingestRemoteIce(
  signaling: SignalingTransport,
  ids: SessionIds,
  peer: PeerConnectionLike,
  diagnostics: {
    localIceCandidates: number;
    remoteIceCandidates: number;
    answerReceived: boolean;
    answerPayloadSize: number;
    answerParseOk: boolean;
    setRemoteDescriptionError: string | null;
  }
): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const signal = await signaling.dequeueSignal(ids.sessionId, ids.studentId, "ice_candidate");
    if (!signal) {
      await delay(250);
      continue;
    }
    try {
      const candidate = JSON.parse(signal.payload) as RTCIceCandidateInit;
      await peer.addIceCandidate(candidate);
      diagnostics.remoteIceCandidates += 1;
    } catch {
      // Keep polling even if one candidate is malformed.
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForIceGatheringComplete(peer: PeerConnectionLike): Promise<void> {
  const rtcPeer = peer as RTCPeerConnection;
  if (typeof rtcPeer.addEventListener !== "function") {
    return;
  }
  if (rtcPeer.iceGatheringState === "complete") {
    return;
  }

  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      rtcPeer.removeEventListener("icegatheringstatechange", onStateChange);
      resolve();
    };
    const onStateChange = () => {
      if (rtcPeer.iceGatheringState === "complete") {
        finish();
      }
    };
    rtcPeer.addEventListener("icegatheringstatechange", onStateChange);
    setTimeout(finish, 2500);
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
