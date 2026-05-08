import type { WorkerScoreMessage } from "../coordinator/types";
import type {
  NormalizedLandmarkList,
  Options as MediaPipePoseOptions,
  Results as MediaPipePoseResults
} from "@mediapipe/pose";

let intervalId: ReturnType<typeof setInterval> | undefined;
let previousCenter: { x: number; y: number } | undefined;
let previousBrightness = 0.5;
type MediaPipePoseApi = {
  send(input: { image: ImageData }): Promise<void>;
  setOptions(options: MediaPipePoseOptions): void;
  onResults(callback: (results: MediaPipePoseResults) => void): void;
};

let poseDetector: MediaPipePoseApi | undefined;
let poseReady = false;
let poseFailed = false;
let latestPoseScore: number | null = null;
let lastPoseLandmarks: NormalizedLandmarkList | undefined;
const workerScope = self as unknown as {
  onmessage: (event: MessageEvent<WorkerInputMessage>) => void;
  setInterval: typeof setInterval;
  clearInterval: typeof clearInterval;
  postMessage: (message: WorkerScoreMessage) => void;
};

type WorkerInputMessage =
  | { type: "start" }
  | { type: "stop" }
  | { type: "frame"; width: number; height: number; pixels: Uint8ClampedArray };

workerScope.onmessage = (event: MessageEvent<WorkerInputMessage>) => {
  if (event.data.type === "start" && intervalId === undefined) {
    previousCenter = undefined;
    void ensurePoseDetector();
    intervalId = workerScope.setInterval(() => {
      const message: WorkerScoreMessage = {
        type: "pose_gaze_score",
        score: 0.1,
        reason: poseReady ? "waiting_for_camera_frames_pose_ready" : "waiting_for_camera_frames",
        sampledAt: new Date().toISOString()
      };
      workerScope.postMessage(message);
    }, 5000);
  }

  if (event.data.type === "frame") {
    void processFrame(event.data);
  }

  if (event.data.type === "stop" && intervalId !== undefined) {
    workerScope.clearInterval(intervalId);
    intervalId = undefined;
    previousCenter = undefined;
  }
};

async function processFrame(frame: {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}): Promise<void> {
  const frameMetrics = scoreFromFrame(frame.width, frame.height, frame.pixels);
  const proxyScore = frameMetrics.score;

  if (!poseFailed) {
    await ensurePoseDetector();
  }

  if (poseDetector && poseReady) {
    try {
      const imageData = new ImageData(new Uint8ClampedArray(frame.pixels), frame.width, frame.height);
      await poseDetector.send({ image: imageData });
      const poseScore = latestPoseScore;
      if (poseScore !== null) {
        const landmarks = extractOverlayLandmarks(lastPoseLandmarks);
        workerScope.postMessage({
          type: "pose_gaze_score",
          score: poseScore,
          reason: "mediapipe_pose_head_orientation_proxy",
          sampledAt: new Date().toISOString(),
          datapoints: frameMetrics.datapoints,
          landmarks: landmarks ?? undefined
        });
        return;
      }
    } catch {
      poseFailed = true;
    }
  }

  workerScope.postMessage({
    type: "pose_gaze_score",
    score: proxyScore,
    reason: "camera_frame_motion_orientation_proxy_fallback",
    sampledAt: new Date().toISOString(),
    datapoints: frameMetrics.datapoints
  });
}

async function ensurePoseDetector(): Promise<void> {
  if (poseReady || poseFailed || poseDetector) {
    return;
  }

  try {
    const mediaPipePose = await import("@mediapipe/pose");
    const PoseCtor = (mediaPipePose as unknown as { Pose?: new (arg: unknown) => MediaPipePoseApi })
      .Pose;
    if (!PoseCtor) {
      poseFailed = true;
      return;
    }

    poseDetector = new PoseCtor({
      locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
    });
    poseDetector.setOptions({
      modelComplexity: 0,
      smoothLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });
    poseDetector.onResults((results) => {
      lastPoseLandmarks = results.poseLandmarks;
      latestPoseScore = scoreFromLandmarks(results.poseLandmarks);
    });
    poseReady = true;
  } catch {
    poseFailed = true;
  }
}

function scoreFromLandmarks(landmarks: NormalizedLandmarkList | undefined): number | null {
  if (!landmarks || landmarks.length === 0) {
    return null;
  }

  const nose = landmarks[0];
  const rightShoulder = landmarks[11];
  const leftShoulder = landmarks[12];
  if (!leftShoulder || !rightShoulder || !nose) {
    return null;
  }

  const shoulderCenterX = (leftShoulder.x + rightShoulder.x) / 2;
  const shoulderCenterY = (leftShoulder.y + rightShoulder.y) / 2;
  const shoulderWidth = Math.max(1, Math.abs(rightShoulder.x - leftShoulder.x));

  const yawLike = Math.min(1, Math.abs(nose.x - shoulderCenterX) / (shoulderWidth * 0.7));
  const pitchLike = Math.min(1, Math.abs(nose.y - shoulderCenterY) / (shoulderWidth * 0.9));
  const raw = yawLike * 0.65 + pitchLike * 0.35;
  return Math.max(0, Math.min(1, raw));
}

function extractOverlayLandmarks(
  landmarks: NormalizedLandmarkList | undefined
): WorkerScoreMessage["landmarks"] | null {
  if (!landmarks || landmarks.length < 13) {
    return null;
  }

  const nose = landmarks[0];
  const rightShoulder = landmarks[11];
  const leftShoulder = landmarks[12];
  if (!nose || !rightShoulder || !leftShoulder) {
    return null;
  }

  return {
    nose: { x: nose.x, y: nose.y },
    leftShoulder: { x: leftShoulder.x, y: leftShoulder.y },
    rightShoulder: { x: rightShoulder.x, y: rightShoulder.y }
  };
}

function scoreFromFrame(
  width: number,
  height: number,
  pixels: Uint8ClampedArray
): {
  score: number;
  datapoints: {
    centerX: number;
    centerY: number;
    motion: number;
    brightness: number;
    brightnessShift: number;
  };
} {
  const sampleStep = 8;
  let sum = 0;
  let weightedX = 0;
  let weightedY = 0;
  let count = 0;

  for (let y = 0; y < height; y += sampleStep) {
    for (let x = 0; x < width; x += sampleStep) {
      const index = (y * width + x) * 4;
      const value = (pixels[index] + pixels[index + 1] + pixels[index + 2]) / (3 * 255);
      sum += value;
      weightedX += x * value;
      weightedY += y * value;
      count += 1;
    }
  }

  if (count === 0 || sum <= 0.0001) {
    return {
      score: 0.1,
      datapoints: {
        centerX: 0.5,
        centerY: 0.5,
        motion: 0,
        brightness: 0.5,
        brightnessShift: 0
      }
    };
  }

  const brightness = sum / count;
  const centerX = weightedX / sum / width;
  const centerY = weightedY / sum / height;

  const motion = previousCenter
    ? Math.hypot(centerX - previousCenter.x, centerY - previousCenter.y)
    : 0;
  const brightnessShift = Math.abs(brightness - previousBrightness);

  previousCenter = { x: centerX, y: centerY };
  previousBrightness = brightness;

  const centerOffset = Math.hypot(centerX - 0.5, centerY - 0.5);
  const rawScore = centerOffset * 1.2 + motion * 3.5 + brightnessShift * 1.8;
  const score = Math.max(0, Math.min(1, rawScore));
  return {
    score,
    datapoints: {
      centerX,
      centerY,
      motion,
      brightness,
      brightnessShift
    }
  };
}

export {};
