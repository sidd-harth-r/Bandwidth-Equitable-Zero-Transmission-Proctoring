import { FusionEngine } from "./coordinator/FusionEngine";
import { TierClassifier } from "./coordinator/TierClassifier";
import type { AnomalyScorePayload, WorkerScoreMessage } from "./coordinator/types";
import { AnomalyScoreClient } from "./network/AnomalyScoreClient";
import { SignalingClient } from "./network/SignalingClient";
import { startWebRtcSignaling, type WebRtcSession } from "./network/WebRtcSignaling";
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
  await requestCameraIfAvailable();
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
  startButton.disabled = true;
  if (stopButton) stopButton.disabled = false;
  if (status) status.textContent = "Running";
});

stopButton?.addEventListener("click", () => {
  worker?.postMessage({ type: "stop" });
  worker?.terminate();
  webRtcSession?.peer.close();
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
  try {
    await client.send(payload);
    if (status) status.textContent = `Sent ${payload.tier}`;
  } catch (error) {
    if (status) status.textContent = "Stored locally; API unavailable";
  }

  if (latest) {
    latest.textContent = JSON.stringify(payload, null, 2);
  }
}

async function requestCameraIfAvailable(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return;
  }

  const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  for (const track of stream.getTracks()) {
    track.stop();
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
