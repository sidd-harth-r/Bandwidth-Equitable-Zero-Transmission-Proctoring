/**
 * ModelManager — LSTM Model Loading and Inference
 *
 * Manages the 2-layer LSTM anomaly detection model in the browser:
 * - Loads model from server or IndexedDB cache
 * - Version checking and cache invalidation
 * - Frozen inference for real-time scoring
 *
 * Architecture: Input(20) → LSTM(64) → LSTM(64) → Dense(1, sigmoid)
 */

export const FEATURE_DIM = 20;
export const SEQ_LENGTH = 150;
export const MODEL_CACHE_KEY = "bezp-anomaly-model";

export interface ModelVersion {
  version: number;
  timestamp: number;
}

/**
 * Flatten all model weights into a single Float32Array.
 * Used for gradient delta computation.
 */
export function flattenWeights(weights: Float32Array[]): Float32Array {
  let totalLen = 0;
  for (const w of weights) totalLen += w.length;

  const flat = new Float32Array(totalLen);
  let offset = 0;
  for (const w of weights) {
    flat.set(w, offset);
    offset += w.length;
  }
  return flat;
}

/**
 * ModelManager handles loading, caching, and inference with the
 * TensorFlow.js anomaly detection model.
 */
export class ModelManager {
  private model: any = null; // tf.LayersModel
  private tf: any = null;
  private currentVersion: ModelVersion = { version: 0, timestamp: 0 };
  private serverUrl: string;

  constructor(serverUrl = "http://localhost:8000") {
    this.serverUrl = serverUrl;
  }

  /** Check the server for the latest model version. */
  async checkVersion(): Promise<ModelVersion> {
    try {
      const res = await fetch(`${this.serverUrl}/api/v1/federated/model/version`);
      if (!res.ok) return this.currentVersion;
      const data = await res.json();
      return { version: data.version, timestamp: Date.now() };
    } catch {
      return this.currentVersion;
    }
  }

  /** Load TensorFlow.js dynamically to avoid blocking initial page load. */
  async loadTf(): Promise<any> {
    if (this.tf) return this.tf;
    try {
      this.tf = await import("@tensorflow/tfjs");
      return this.tf;
    } catch {
      return null;
    }
  }

  /**
   * Build the model architecture programmatically.
   * Used when no pre-trained weights are available.
   */
  async buildModel(): Promise<any> {
    const tf = await this.loadTf();
    if (!tf) return null;

    const model = tf.sequential();
    model.add(
      tf.layers.lstm({
        units: 64,
        returnSequences: true,
        inputShape: [SEQ_LENGTH, FEATURE_DIM],
        name: "lstm_1",
      }),
    );
    model.add(
      tf.layers.lstm({
        units: 64,
        returnSequences: false,
        name: "lstm_2",
      }),
    );
    model.add(
      tf.layers.dense({
        units: 1,
        activation: "sigmoid",
        name: "anomaly_score",
      }),
    );

    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: "binaryCrossentropy",
      metrics: ["accuracy"],
    });

    this.model = model;
    return model;
  }

  /**
   * Get all model weights as Float32Arrays.
   */
  getWeights(): Float32Array[] {
    if (!this.model) return [];
    const tensors = this.model.getWeights() as any[];
    return tensors.map((t: any) => {
      const data = t.dataSync() as Float32Array;
      return new Float32Array(data);
    });
  }

  /**
   * Set model weights from Float32Arrays.
   */
  setWeights(weights: Float32Array[]): void {
    if (!this.model || !this.tf) return;
    const currentTensors = this.model.getWeights() as any[];
    const newTensors = weights.map((w, i) =>
      this.tf.tensor(w, currentTensors[i].shape),
    );
    this.model.setWeights(newTensors);
    // Dispose old tensors
    for (const t of newTensors) t.dispose();
  }

  /**
   * Run inference on a telemetry window.
   * Returns anomaly probability [0, 1].
   */
  async predict(telemetryWindow: Float32Array): Promise<number> {
    if (!this.model || !this.tf) return 0;

    const tf = this.tf;
    const input = tf.tensor3d(
      Array.from(telemetryWindow),
      [1, SEQ_LENGTH, FEATURE_DIM],
    );
    const prediction = this.model.predict(input) as any;
    const score = (await prediction.data())[0];

    input.dispose();
    prediction.dispose();

    return score;
  }

  /** Get the underlying model for training. */
  getModel(): any {
    return this.model;
  }

  /** Dispose all tensors. */
  dispose(): void {
    if (this.model) {
      this.model.dispose();
      this.model = null;
    }
  }
}
