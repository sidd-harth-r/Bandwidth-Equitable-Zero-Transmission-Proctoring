import type { WorkerScoreMessage } from "../coordinator/types";

let intervalId: ReturnType<typeof setInterval> | undefined;
let tick = 0;
const workerScope = self as unknown as {
  onmessage: (event: MessageEvent<{ type: string }>) => void;
  setInterval: typeof setInterval;
  clearInterval: typeof clearInterval;
  postMessage: (message: WorkerScoreMessage) => void;
};

workerScope.onmessage = (event: MessageEvent<{ type: string }>) => {
  if (event.data.type === "start" && intervalId === undefined) {
    intervalId = workerScope.setInterval(() => {
      tick += 1;
      const score = 0.35 + Math.abs(Math.sin(tick / 6)) * 0.4;
      const message: WorkerScoreMessage = {
        type: "pose_gaze_score",
        score,
        reason: "phase_1_placeholder_until_mediapipe_pose_is_wired",
        sampledAt: new Date().toISOString()
      };
      workerScope.postMessage(message);
    }, 2000);
  }

  if (event.data.type === "stop" && intervalId !== undefined) {
    workerScope.clearInterval(intervalId);
    intervalId = undefined;
  }
};

export {};
