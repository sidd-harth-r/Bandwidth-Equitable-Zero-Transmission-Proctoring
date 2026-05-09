import { Coordinator } from "./coordinator/Coordinator";
import type { AnomalyScorePayload, ChannelScores } from "./coordinator/types";
import { AnomalyScoreClient } from "./network/AnomalyScoreClient";
import { SessionHistoryClient } from "./network/SessionHistoryClient";
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

/* ── Configuration ────────────────────────────────────────── */

const studentId = "local-demo-student";
const proctorId = "local-demo-proctor";
let activeSessionId = `session-${crypto.randomUUID()}`;
const store = new SessionStore();
const scoreClient = new AnomalyScoreClient();
const historyClient = new SessionHistoryClient();
const signaling = new SignalingClient();
let coordinator: Coordinator | undefined;
let webRtcSession: WebRtcSession | undefined;
let mediaStream: MediaStream | undefined;
let audioContext: AudioContext | undefined;
let audioAnalyser: AnalyserNode | undefined;
let audioMagnitudes: Float32Array<ArrayBuffer> | undefined;
let framePumpId: ReturnType<typeof setInterval> | undefined;
let audioPumpId: ReturnType<typeof setInterval> | undefined;
let captureCanvas: HTMLCanvasElement | undefined;
let captureContext: CanvasRenderingContext2D | null = null;
let captureVideo: HTMLVideoElement | undefined;
let loopbackHandle: LoopbackHandle | undefined;
let sentEventCount = 0;
let dataChannelSentCount = 0;

/* ── UI ───────────────────────────────────────────────────── */

app.innerHTML = `
  <section class="shell">
    <header>
      <p class="eyebrow">BEZP Phase 2</p>
      <h1>Multi-Channel Anomaly Detection</h1>
      <p class="summary">Four detection channels (Pose/Gaze, rPPG, Action Units, Keystroke) run independently with per-channel baseline calibration. Audio analysis detects voice activity. All channels feed into weighted fusion scoring.</p>
    </header>
    <div class="panel">
      <button id="start" type="button">Start Session</button>
      <button id="stop" type="button" disabled>Stop</button>
      <span id="status">Idle</span>
      <span id="dc-status">DataChannel: not-started</span>
    </div>

    <section class="channel-grid" id="channel-grid">
      <article class="channel-card" id="card-pose-gaze">
        <div class="channel-header">
          <span class="channel-dot dot-inactive"></span>
          <h3>Pose / Gaze</h3>
        </div>
        <div class="channel-score" id="score-pose-gaze">0.000</div>
        <div class="channel-bar"><div class="channel-bar-fill" id="bar-pose-gaze"></div></div>
        <p class="channel-weight">Weight: 0.35</p>
      </article>
      <article class="channel-card" id="card-rppg">
        <div class="channel-header">
          <span class="channel-dot dot-inactive"></span>
          <h3>rPPG</h3>
        </div>
        <div class="channel-score" id="score-rppg">0.000</div>
        <div class="channel-bar"><div class="channel-bar-fill" id="bar-rppg"></div></div>
        <p class="channel-weight">Weight: 0.20</p>
      </article>
      <article class="channel-card" id="card-au">
        <div class="channel-header">
          <span class="channel-dot dot-inactive"></span>
          <h3>Action Units</h3>
        </div>
        <div class="channel-score" id="score-au">0.000</div>
        <div class="channel-bar"><div class="channel-bar-fill" id="bar-au"></div></div>
        <p class="channel-weight">Weight: 0.25</p>
      </article>
      <article class="channel-card" id="card-keystroke">
        <div class="channel-header">
          <span class="channel-dot dot-inactive"></span>
          <h3>Keystroke</h3>
        </div>
        <div class="channel-score" id="score-keystroke">0.000</div>
        <div class="channel-bar"><div class="channel-bar-fill" id="bar-keystroke"></div></div>
        <p class="channel-weight">Weight: 0.20</p>
      </article>
    </section>

    <section class="fusion-panel" id="fusion-panel">
      <div class="fusion-row">
        <div class="fusion-stat">
          <span class="fusion-label">Weighted Score</span>
          <span class="fusion-value" id="fusion-weighted">0.000</span>
        </div>
        <div class="fusion-stat">
          <span class="fusion-label">Agreement</span>
          <span class="fusion-value" id="fusion-agreement">0.000</span>
        </div>
        <div class="fusion-stat">
          <span class="fusion-label">Tier</span>
          <span class="fusion-value fusion-tier" id="fusion-tier">tier_3</span>
        </div>
        <div class="fusion-stat">
          <span class="fusion-label">Gear</span>
          <span class="fusion-value" id="fusion-gear">gear_1</span>
        </div>
        <div class="fusion-stat">
          <span class="fusion-label">Events Sent</span>
          <span class="fusion-value" id="fusion-events">0</span>
        </div>
      </div>
    </section>

    <section class="telemetry">
      <article class="camera-panel">
        <h2>Camera Feed</h2>
        <div class="camera-stage">
          <video id="camera-feed" autoplay playsinline muted></video>
        </div>
        <p id="camera-state">Camera: not started</p>
      </article>
      <article class="detect-panel">
        <h2>Calibration Status</h2>
        <div id="calibration-status">
          <p id="cal-pose-gaze">Pose/Gaze: waiting</p>
          <p id="cal-rppg">rPPG: waiting</p>
          <p id="cal-au">AU: waiting</p>
          <p id="cal-keystroke">Keystroke: waiting</p>
          <p id="cal-audio">Audio: waiting</p>
        </div>
        <h2>Keystroke Input</h2>
        <textarea id="keystroke-area" rows="3" placeholder="Type here for keystroke calibration..."></textarea>
      </article>
    </section>
    <pre id="latest">{}</pre>
  </section>
`;

/* ── DOM refs ─────────────────────────────────────────────── */

const startButton = document.querySelector<HTMLButtonElement>("#start");
const stopButton = document.querySelector<HTMLButtonElement>("#stop");
const statusEl = document.querySelector<HTMLSpanElement>("#status");
const dcStatus = document.querySelector<HTMLSpanElement>("#dc-status");
const latest = document.querySelector<HTMLPreElement>("#latest");
const cameraState = document.querySelector<HTMLParagraphElement>("#camera-state");
const cameraFeed = document.querySelector<HTMLVideoElement>("#camera-feed");
const keystrokeArea = document.querySelector<HTMLTextAreaElement>("#keystroke-area");

const channelScoreEls = {
  pose_gaze: document.getElementById("score-pose-gaze"),
  rppg: document.getElementById("score-rppg"),
  au: document.getElementById("score-au"),
  keystroke: document.getElementById("score-keystroke"),
};

const channelBarEls = {
  pose_gaze: document.getElementById("bar-pose-gaze"),
  rppg: document.getElementById("bar-rppg"),
  au: document.getElementById("bar-au"),
  keystroke: document.getElementById("bar-keystroke"),
};

const channelDots = {
  pose_gaze: document.querySelector("#card-pose-gaze .channel-dot"),
  rppg: document.querySelector("#card-rppg .channel-dot"),
  au: document.querySelector("#card-au .channel-dot"),
  keystroke: document.querySelector("#card-keystroke .channel-dot"),
};

const calEls = {
  pose_gaze: document.getElementById("cal-pose-gaze"),
  rppg: document.getElementById("cal-rppg"),
  au: document.getElementById("cal-au"),
  keystroke: document.getElementById("cal-keystroke"),
  audio: document.getElementById("cal-audio"),
};

const fusionWeighted = document.getElementById("fusion-weighted");
const fusionAgreement = document.getElementById("fusion-agreement");
const fusionTier = document.getElementById("fusion-tier");
const fusionGear = document.getElementById("fusion-gear");
const fusionEvents = document.getElementById("fusion-events");

/* ── Start / Stop ─────────────────────────────────────────── */

startButton?.addEventListener("click", async () => {
  activeSessionId = `session-${crypto.randomUUID()}`;
  sentEventCount = 0;
  dataChannelSentCount = 0;

  // Fetch session history prior and compute adjustments
  const prior = await historyClient.fetchPrior(studentId);
  const adjustments = prior
    ? historyClient.computeAdjustments(prior)
    : { weights: {}, thresholds: {} };

  // Create Coordinator with adjusted config
  coordinator = new Coordinator(
    {
      sessionId: activeSessionId,
      studentId,
      weights: adjustments.weights,
      thresholds: adjustments.thresholds,
    },
    {
      onAnomalyScore: handleAnomalyScore,
      onCalibrationProgress: handleCalibrationProgress,
      onError: handleChannelError,
    }
  );

  try {
    await startCameraCapture();
    loopbackHandle = startLocalProctorLoopback(signaling, {
      sessionId: activeSessionId,
      studentId,
      proctorId
    });
    webRtcSession = await startWebRtcSignaling(signaling, {
      sessionId: activeSessionId,
      studentId,
      proctorId
    });
    bindDataChannelStatus(webRtcSession.dataChannel);
  } catch {
    if (statusEl) statusEl.textContent = "Running (signaling unavailable)";
  }

  coordinator.start();
  startFramePump();
  startAudioCapture();
  bindKeystrokeEvents();

  startButton.disabled = true;
  if (stopButton) stopButton.disabled = false;
  if (statusEl?.textContent === "Idle") statusEl.textContent = "Running — calibrating…";
});

stopButton?.addEventListener("click", () => {
  coordinator?.stop();
  coordinator = undefined;
  webRtcSession?.peer.close();
  loopbackHandle?.stop();
  stopFramePump();
  stopAudioCapture();
  stopCameraCapture();
  webRtcSession = undefined;
  loopbackHandle = undefined;
  if (startButton) startButton.disabled = false;
  if (stopButton) stopButton.disabled = true;
  if (statusEl) statusEl.textContent = "Stopped";
});

/* ── Anomaly score handler ────────────────────────────────── */

async function handleAnomalyScore(payload: AnomalyScorePayload): Promise<void> {
  await store.addAnomalyEvent(payload);

  const sentViaDataChannel =
    webRtcSession !== undefined
      ? sendAnomalyScoreOverDataChannel(webRtcSession.dataChannel, payload)
      : false;

  if (sentViaDataChannel) {
    sentEventCount += 1;
    dataChannelSentCount += 1;
    if (statusEl) statusEl.textContent = `Sent ${payload.tier} (DC) #${sentEventCount} ${formatNow()}`;
    if (dcStatus) dcStatus.textContent = `DataChannel: open, sent=${dataChannelSentCount}`;
  } else {
    try {
      await scoreClient.send(payload);
      sentEventCount += 1;
      if (statusEl) statusEl.textContent = `Sent ${payload.tier} (HTTP) #${sentEventCount} ${formatNow()}`;
    } catch {
      if (statusEl) statusEl.textContent = "Stored locally; API unavailable";
    }
  }

  updateChannelUI(payload.channel_scores);
  updateFusionUI(payload);

  if (latest) {
    latest.textContent = JSON.stringify(payload, null, 2);
  }
}

/* ── Calibration progress handler ─────────────────────────── */

function handleCalibrationProgress(channel: string, progress: string): void {
  const el = calEls[channel as keyof typeof calEls];
  if (el) {
    const label = channel.replace("_", "/").toUpperCase();
    if (progress.includes("complete")) {
      el.textContent = `${label}: ✅ calibrated`;
      el.classList.add("cal-done");
    } else {
      el.textContent = `${label}: ${progress}`;
    }
  }
}

function handleChannelError(channel: string, error: unknown): void {
  const el = calEls[channel as keyof typeof calEls];
  if (el) {
    el.textContent = `${channel}: ⚠ error`;
  }
  console.warn(`[${channel}] worker error:`, error);
}

/* ── UI updates ───────────────────────────────────────────── */

function updateChannelUI(scores: ChannelScores): void {
  const channels = ["pose_gaze", "rppg", "au", "keystroke"] as const;
  for (const ch of channels) {
    const scoreVal = scores[ch];
    const scoreEl = channelScoreEls[ch];
    const barEl = channelBarEls[ch] as HTMLDivElement | null;
    const dotEl = channelDots[ch];

    if (scoreEl) scoreEl.textContent = scoreVal.toFixed(3);
    if (barEl) {
      barEl.style.width = `${Math.round(scoreVal * 100)}%`;
      barEl.className = "channel-bar-fill";
      if (scoreVal >= 0.6) barEl.classList.add("bar-high");
      else if (scoreVal >= 0.3) barEl.classList.add("bar-mid");
      else barEl.classList.add("bar-low");
    }
    if (dotEl) {
      dotEl.className = "channel-dot";
      if (scoreVal > 0 || coordinator?.getChannelReadiness()[ch]) {
        dotEl.classList.add("dot-active");
      } else {
        dotEl.classList.add("dot-inactive");
      }
    }
  }
}

function updateFusionUI(payload: AnomalyScorePayload): void {
  if (fusionWeighted) fusionWeighted.textContent = payload.weighted_score.toFixed(3);
  if (fusionAgreement) fusionAgreement.textContent = payload.agreement_index.toFixed(3);
  if (fusionTier) {
    fusionTier.textContent = payload.tier;
    fusionTier.className = "fusion-value fusion-tier";
    fusionTier.classList.add(`tier-${payload.tier.replace("tier_", "")}`);
  }
  if (fusionGear) fusionGear.textContent = payload.gear;
  if (fusionEvents) fusionEvents.textContent = String(sentEventCount);
}

/* ── Camera capture ───────────────────────────────────────── */

async function startCameraCapture(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) return;

  mediaStream = await navigator.mediaDevices.getUserMedia({
    video: { width: 320, height: 240, frameRate: { ideal: 10, max: 15 } },
    audio: true // Enable audio for AudioAnalyser
  });

  if (!cameraFeed) throw new Error("Missing camera feed element");
  captureVideo = cameraFeed;
  captureVideo.srcObject = mediaStream;
  await captureVideo.play();

  if (cameraState) cameraState.textContent = "Camera: active";

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
  if (cameraState) cameraState.textContent = "Camera: stopped";
}

/* ── Frame pump (sends frames to Coordinator) ─────────────── */

function startFramePump(): void {
  if (!captureVideo || !captureCanvas || !captureContext || !coordinator) return;

  framePumpId = setInterval(() => {
    if (!captureVideo || !captureCanvas || !captureContext || !coordinator) return;

    captureContext.drawImage(captureVideo, 0, 0, captureCanvas.width, captureCanvas.height);
    const image = captureContext.getImageData(0, 0, captureCanvas.width, captureCanvas.height);

    // Send to Coordinator which distributes to PoseGaze, rPPG, and AU workers
    coordinator.sendFrame(captureCanvas.width, captureCanvas.height, image.data);
  }, 700);
}

function stopFramePump(): void {
  if (framePumpId !== undefined) {
    clearInterval(framePumpId);
    framePumpId = undefined;
  }
}

/* ── Audio capture ────────────────────────────────────────── */

function startAudioCapture(): void {
  if (!mediaStream || !coordinator) return;

  const audioTracks = mediaStream.getAudioTracks();
  if (audioTracks.length === 0) return;

  try {
    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(mediaStream);
    audioAnalyser = audioContext.createAnalyser();
    audioAnalyser.fftSize = 512;
    source.connect(audioAnalyser);
    audioMagnitudes = new Float32Array(audioAnalyser.frequencyBinCount);

    audioPumpId = setInterval(() => {
      if (!audioAnalyser || !audioMagnitudes || !coordinator) return;
      audioAnalyser.getFloatFrequencyData(audioMagnitudes);
      coordinator.sendAudioMagnitudes(audioMagnitudes);
    }, 200);
  } catch {
    // Audio analysis not available — graceful degradation
  }
}

function stopAudioCapture(): void {
  if (audioPumpId !== undefined) {
    clearInterval(audioPumpId);
    audioPumpId = undefined;
  }
  if (audioContext) {
    void audioContext.close();
    audioContext = undefined;
  }
  audioAnalyser = undefined;
  audioMagnitudes = undefined;
}

/* ── Keystroke event binding ──────────────────────────────── */

function bindKeystrokeEvents(): void {
  if (!keystrokeArea || !coordinator) return;

  keystrokeArea.addEventListener("keydown", (e: KeyboardEvent) => {
    coordinator?.sendKeydown(e.key, Date.now());
  });

  keystrokeArea.addEventListener("keyup", (e: KeyboardEvent) => {
    coordinator?.sendKeyup(e.key, Date.now());
  });

  keystrokeArea.addEventListener("paste", (e: ClipboardEvent) => {
    const text = e.clipboardData?.getData("text") ?? "";
    coordinator?.sendPaste(Date.now(), text.length);
  });
}

/* ── DataChannel status ───────────────────────────────────── */

function bindDataChannelStatus(channel: {
  readyState: string;
  addEventListener?: (type: string, listener: () => void) => void;
}): void {
  if (!dcStatus) return;
  dcStatus.textContent = `DataChannel: ${channel.readyState}`;
  if (typeof channel.addEventListener === "function") {
    channel.addEventListener("open", () => {
      if (dcStatus) dcStatus.textContent = `DataChannel: open, sent=${dataChannelSentCount}`;
    });
    channel.addEventListener("close", () => {
      if (dcStatus) dcStatus.textContent = "DataChannel: closed";
    });
  }
}

/* ── Helpers ──────────────────────────────────────────────── */

function formatNow(): string {
  return new Date().toLocaleTimeString();
}
