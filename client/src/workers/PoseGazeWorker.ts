import type { WorkerScoreMessage } from "../coordinator/types";

let intervalId: ReturnType<typeof setInterval> | undefined;
let previousCenter: { x: number; y: number } | undefined;
let previousBrightness = 0.5;
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
    intervalId = workerScope.setInterval(() => {
      const message: WorkerScoreMessage = {
        type: "pose_gaze_score",
        score: 0.1,
        reason: "waiting_for_camera_frames",
        sampledAt: new Date().toISOString()
      };
      workerScope.postMessage(message);
    }, 5000);
  }

  if (event.data.type === "frame") {
    const score = scoreFromFrame(event.data.width, event.data.height, event.data.pixels);
    const message: WorkerScoreMessage = {
      type: "pose_gaze_score",
      score,
      reason: "camera_frame_motion_orientation_proxy",
      sampledAt: new Date().toISOString()
    };
    workerScope.postMessage(message);
  }

  if (event.data.type === "stop" && intervalId !== undefined) {
    workerScope.clearInterval(intervalId);
    intervalId = undefined;
    previousCenter = undefined;
  }
};

function scoreFromFrame(width: number, height: number, pixels: Uint8ClampedArray): number {
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
    return 0.1;
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
  return Math.max(0, Math.min(1, rawScore));
}

export {};
