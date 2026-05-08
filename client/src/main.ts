import { FusionEngine } from "./coordinator/FusionEngine";
import { TierClassifier } from "./coordinator/TierClassifier";
import type { AnomalyScorePayload, WorkerScoreMessage } from "./coordinator/types";
import { AnomalyScoreClient } from "./network/AnomalyScoreClient";
import { startLocalProctorLoopback, type LoopbackHandle } from "./network/LocalProctorLoopback";
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
let overlayCanvas: HTMLCanvasElement | undefined;
let overlayContext: CanvasRenderingContext2D | null = null;
let loopbackHandle: LoopbackHandle | undefined;
let sentEventCount = 0;

app.innerHTML = `
  <section class="shell">
    <header>
      <p class="eyebrow">BEZP Phase 1</p>
      <h1>Local Anomaly Score Slice</h1>
      <p class="summary">Pose/gaze scoring runs from camera frames in a Web Worker, stores locally, and sends derived scores over DataChannel with HTTP fallback.</p>
    </header>
    <div class="panel">
      <button id="start" type="button">Start Session</button>
      <button id="stop" type="button" disabled>Stop</button>
      <span id="status">Idle</span>
    </div>
    <section class="telemetry">
      <article class="camera-panel">
        <h2>Camera Feed</h2>
        <div class="camera-stage">
          <video id="camera-feed" autoplay playsinline muted></video>
          <canvas id="camera-overlay" width="320" height="240"></canvas>
        </div>
        <p id="camera-state">Camera: not started</p>
      </article>
      <article class="detect-panel">
        <h2>Detection Details</h2>
        <p id="detect-mode">Mode: waiting</p>
        <p id="detect-what">Detects: head orientation proxy (nose vs shoulders), frame motion, and brightness shifts.</p>
        <p id="detect-score">Score: waiting</p>
      </article>
    </section>
    <pre id="latest">{}</pre>
  </section>
`;

const startButton = document.querySelector<HTMLButtonElement>("#start");
const stopButton = document.querySelector<HTMLButtonElement>("#stop");
const status = document.querySelector<HTMLSpanElement>("#status");
const latest = document.querySelector<HTMLPreElement>("#latest");
const cameraState = document.querySelector<HTMLParagraphElement>("#camera-state");
const detectMode = document.querySelector<HTMLParagraphElement>("#detect-mode");
const detectScore = document.querySelector<HTMLParagraphElement>("#detect-score");
const cameraFeed = document.querySelector<HTMLVideoElement>("#camera-feed");
const cameraOverlay = document.querySelector<HTMLCanvasElement>("#camera-overlay");

startButton?.addEventListener("click", async () => {
  await startCameraCapture();
  loopbackHandle = startLocalProctorLoopback(signaling, {
    sessionId,
    studentId,
    proctorId
  });
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
  loopbackHandle?.stop();
  stopFramePump();
  stopCameraCapture();
  worker = undefined;
  webRtcSession = undefined;
  loopbackHandle = undefined;
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
    sentEventCount += 1;
    if (status) status.textContent = `Sent ${payload.tier} (DataChannel) #${sentEventCount} ${formatNow()}`;
  } else {
    try {
      await client.send(payload);
      sentEventCount += 1;
      if (status) {
        status.textContent = `Sent ${payload.tier} (HTTP fallback) #${sentEventCount} ${formatNow()}`;
      }
    } catch (error) {
      if (status) status.textContent = "Stored locally; API unavailable";
    }
  }

  if (latest) {
    latest.textContent = JSON.stringify(payload, null, 2);
  }

  updateDetectionDetails(message.reason, message.score);
  drawOverlay(message);
}

async function startCameraCapture(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return;
  }

  mediaStream = await navigator.mediaDevices.getUserMedia({
    video: { width: 320, height: 240, frameRate: { ideal: 10, max: 15 } },
    audio: false
  });
  if (!cameraFeed) {
    throw new Error("Missing camera feed element");
  }
  captureVideo = cameraFeed;
  captureVideo.srcObject = mediaStream;
  await captureVideo.play();

  overlayCanvas = cameraOverlay ?? undefined;
  overlayContext = overlayCanvas?.getContext("2d") ?? null;
  if (overlayCanvas) {
    overlayCanvas.width = 320;
    overlayCanvas.height = 240;
  }

  if (cameraState) {
    cameraState.textContent = "Camera: active";
  }

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
  if (overlayContext && overlayCanvas) {
    overlayContext.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  }
  overlayCanvas = undefined;
  overlayContext = null;
  captureCanvas = undefined;
  captureContext = null;
  if (cameraState) {
    cameraState.textContent = "Camera: stopped";
  }
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

function formatNow(): string {
  const now = new Date();
  return now.toLocaleTimeString();
}

function updateDetectionDetails(reason: string, score: number): void {
  if (detectMode) {
    if (reason.includes("mediapipe_pose")) {
      detectMode.textContent = "Mode: MediaPipe Pose landmarks (nose/shoulder orientation proxy)";
    } else if (reason.includes("fallback")) {
      detectMode.textContent = "Mode: fallback frame proxy (motion + brightness + center drift)";
    } else {
      detectMode.textContent = `Mode: ${reason}`;
    }
  }

  if (detectScore) {
    const band = score >= 0.6 ? "elevated" : score >= 0.3 ? "moderate" : "low";
    detectScore.textContent = `Score: ${score.toFixed(3)} (${band})`;
  }
}

function drawOverlay(message: WorkerScoreMessage): void {
  if (!overlayContext || !overlayCanvas) {
    return;
  }

  overlayContext.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  if (!message.landmarks) {
    return;
  }

  const nose = mapPoint(message.landmarks.nose, overlayCanvas.width, overlayCanvas.height);
  const leftShoulder = mapPoint(
    message.landmarks.leftShoulder,
    overlayCanvas.width,
    overlayCanvas.height
  );
  const rightShoulder = mapPoint(
    message.landmarks.rightShoulder,
    overlayCanvas.width,
    overlayCanvas.height
  );

  overlayContext.strokeStyle = "#15aabf";
  overlayContext.lineWidth = 2;
  overlayContext.beginPath();
  overlayContext.moveTo(leftShoulder.x, leftShoulder.y);
  overlayContext.lineTo(rightShoulder.x, rightShoulder.y);
  overlayContext.stroke();

  drawPoint(nose.x, nose.y, "#ff6b6b");
  drawPoint(leftShoulder.x, leftShoulder.y, "#4dabf7");
  drawPoint(rightShoulder.x, rightShoulder.y, "#4dabf7");
}

function drawPoint(x: number, y: number, color: string): void {
  if (!overlayContext) {
    return;
  }
  overlayContext.fillStyle = color;
  overlayContext.beginPath();
  overlayContext.arc(x, y, 4, 0, Math.PI * 2);
  overlayContext.fill();
}

function mapPoint(point: { x: number; y: number }, width: number, height: number): { x: number; y: number } {
  return {
    x: point.x * width,
    y: point.y * height
  };
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
