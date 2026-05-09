import type { GearConfigMessage } from "../coordinator/types";
import { ModelManager } from "../ml/ModelManager";

type FlModelWorkerInput = 
  | { type: "start" }
  | { type: "stop" }
  | { type: "inference"; features: number[] }
  | GearConfigMessage;

const workerScope = self as unknown as {
  onmessage: (event: MessageEvent<FlModelWorkerInput>) => void;
  postMessage: (message: any) => void;
};

let running = false;
let inferenceActive = true;
const modelManager = new ModelManager();

workerScope.onmessage = async (event: MessageEvent<FlModelWorkerInput>) => {
  const msg = event.data;

  if (msg.type === "GEAR_CONFIG") {
    // Disable inference entirely in Gear 4 to save CPU
    inferenceActive = msg.gear !== "gear_4";
    return;
  }

  if (msg.type === "start") {
    running = true;
    try {
      await modelManager.loadModel();
    } catch (err) {
      console.error("FlModelWorker failed to load model", err);
    }
  }

  if (msg.type === "stop") {
    running = false;
  }

  if (msg.type === "inference" && running && inferenceActive) {
    try {
      const score = await modelManager.predict(msg.features);
      workerScope.postMessage({
        type: "fl_model_score",
        score,
        sampledAt: new Date().toISOString()
      });
    } catch (err) {
      // Inference failed or model not ready
    }
  }
};

export {};
