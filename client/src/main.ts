import { FusionEngine } from "./coordinator/FusionEngine";
import { TierClassifier } from "./coordinator/TierClassifier";
import type { AnomalyScorePayload, WorkerScoreMessage } from "./coordinator/types";
import { AnomalyScoreClient } from "./network/AnomalyScoreClient";
import { SignalingClient } from "./network/SignalingClient";
import {
  sendAnomalyScoreOverDataChannel,
  startWebRtcSignaling,
  type WebRtcSession
} from "./network/WebRtcSignaling";
import { SessionStore } from "./storage/SessionStore";

import "./styles.css";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app root");
}

const sessionId = `session-${crypto.randomUUID()}`;
const studentId = "local-demo-student";
const proctorId = "local-demo-proctor";
const fusionEngine = new FusionEngine();
const tierClassifier = new TierClassifier();
const store = new SessionStore();
const client = new AnomalyScoreClient();
const signaling = new SignalingClient();
let worker: Worker | undefined;
let webRtcSession: WebRtcSession | undefined;
let mediaStream: MediaStream | undefined;
let framePumpId: ReturnType<typeof setInterval> | undefined;
let captureCanvas: HTMLCanvasElement | undefined;
let captureContext: CanvasRenderingContext2D | null = null;
let captureVideo: HTMLVideoElement | undefined;

app.innerHTML = `
  <section class="shell">
    <header>
      <p class="eyebrow">BEZP Phase 1</p>
      <h1>Local Anomaly Score Slice</h1>
      <p class="summary">Pose/gaze placeholder scoring runs in a Web Worker, stores locally, and posts derived scores to the Phase 1 API.</p>
    </header>
    <div class="panel">
      <button id="start" type="button">Start Session</button>
      <button id="stop" type="button" disabled>Stop</button>
      <span id="status">Idle</span>
    </div>
    <pre id="latest">{}</pre>
  </section>
`;

const startButton = document.querySelector<HTMLButtonElement>("#start");
const stopButton = document.querySelector<HTMLButtonElement>("#stop");
const status = document.querySelector<HTMLSpanElement>("#status");
const latest = document.querySelector<HTMLPreElement>("#latest");

startButton?.addEventListener("click", async () => {
  await startCameraCapture();
  webRtcSession = await startWebRtcSignaling(signaling, {
    sessionId,
    studentId,
    proctorId
  });
  void updateSignalingStatus(webRtcSession);
  worker = new Worker(new URL("./workers/PoseGazeWorker.ts", import.meta.url), {
    type: "module"
  });
  worker.onmessage = (event: MessageEvent<WorkerScoreMessage>) => {
    void handleWorkerScore(event.data);
  };
  worker.postMessage({ type: "start" });
  startFramePump();
  startButton.disabled = true;
  if (stopButton) stopButton.disabled = false;
  if (status) status.textContent = "Running";
});

stopButton?.addEventListener("click", () => {
  worker?.postMessage({ type: "stop" });
  worker?.terminate();
  webRtcSession?.peer.close();
  stopFramePump();
  stopCameraCapture();
  worker = undefined;
  webRtcSession = undefined;
  if (startButton) startButton.disabled = false;
  if (stopButton) stopButton.disabled = true;
  if (status) status.textContent = "Stopped";
});

async function handleWorkerScore(message: WorkerScoreMessage): Promise<void> {
  const fusion = fusionEngine.fuse({
    pose_gaze: message.score,
    rppg: 0,
    au: 0,
    keystroke: 0
  });
  const payload: AnomalyScorePayload = {
    ...fusion,
    session_id: sessionId,
    student_id: studentId,
    occurred_at: message.sampledAt,
    tier: tierClassifier.classify(fusion),
    gear: "gear_1",
    metadata: {
      source: "pose_gaze_worker",
      reason: message.reason
    }
  };

  await store.addAnomalyEvent(payload);
  const sentViaDataChannel =
    webRtcSession !== undefined
      ? sendAnomalyScoreOverDataChannel(webRtcSession.dataChannel, payload)
      : false;

  if (sentViaDataChannel) {
    if (status) status.textContent = `Sent ${payload.tier} (DataChannel)`;
  } else {
    try {
      await client.send(payload);
      if (status) status.textContent = `Sent ${payload.tier} (HTTP fallback)`;
    } catch (error) {
      if (status) status.textContent = "Stored locally; API unavailable";
    }
  }

  if (latest) {
    latest.textContent = JSON.stringify(payload, null, 2);
  }
}

async function startCameraCapture(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return;
  }

  mediaStream = await navigator.mediaDevices.getUserMedia({
    video: { width: 320, height: 240, frameRate: { ideal: 10, max: 15 } },
    audio: false
  });
  captureVideo = document.createElement("video");
  captureVideo.playsInline = true;
  captureVideo.muted = true;
  captureVideo.srcObject = mediaStream;
  await captureVideo.play();

  captureCanvas = document.createElement("canvas");
  captureCanvas.width = 160;
  captureCanvas.height = 120;
  captureContext = captureCanvas.getContext("2d");
}

function stopCameraCapture(): void {
  if (captureVideo) {
    captureVideo.pause();
    captureVideo.srcObject = null;
  }
  if (mediaStream) {
    for (const track of mediaStream.getTracks()) {
      track.stop();
    }
  }
  mediaStream = undefined;
  captureVideo = undefined;
  captureCanvas = undefined;
  captureContext = null;
}

function startFramePump(): void {
  if (!captureVideo || !captureCanvas || !captureContext || !worker) {
    return;
  }

  framePumpId = setInterval(() => {
    if (!captureVideo || !captureCanvas || !captureContext || !worker) {
      return;
    }

    captureContext.drawImage(captureVideo, 0, 0, captureCanvas.width, captureCanvas.height);
    const image = captureContext.getImageData(0, 0, captureCanvas.width, captureCanvas.height);
    worker.postMessage({
      type: "frame",
      width: captureCanvas.width,
      height: captureCanvas.height,
      pixels: image.data
    });
  }, 700);
}

function stopFramePump(): void {
  if (framePumpId !== undefined) {
    clearInterval(framePumpId);
    framePumpId = undefined;
  }
}

async function updateSignalingStatus(session: WebRtcSession): Promise<void> {
  try {
    const answered = await session.waitForAnswer;
    if (answered && status) {
      status.textContent = "Signaling answer received";
    }
  } catch {
    if (status) {
      status.textContent = "Running";
    }
  }
}
