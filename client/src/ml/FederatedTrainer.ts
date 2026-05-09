/**
 * FederatedTrainer — Post-exam local training
 *
 * After an exam completes, this module:
 *   1. Extracts training samples from SessionHistory
 *   2. Snapshots the current model weights (pre-training)
 *   3. Trains the model locally for 5 epochs
 *   4. Computes weight deltas (post - pre)
 *   5. Applies DP via PrivacyEngine
 *   6. Hands the privatized gradient to GradientTransmitter
 *
 * The student sees a progress UI during steps 2-6.
 */

import { ModelManager, flattenWeights, SEQ_LENGTH, FEATURE_DIM } from "./ModelManager";
import { SessionHistory, TrainingSample } from "./SessionHistory";
import { privatize, PrivacyConfig, SparseGradient } from "./PrivacyEngine";

export interface TrainingConfig {
  epochs: number;
  batchSize: number;
  learningRate: number;
  privacy: Partial<PrivacyConfig>;
}

export interface TrainingResult {
  /** Number of training samples used */
  sampleCount: number;
  /** Privatized sparse gradient ready for transmission */
  gradient: SparseGradient;
  /** DP sigma used (for server-side verification) */
  dpSigma: number;
  /** Training duration in milliseconds */
  durationMs: number;
}

export type TrainingProgress = {
  stage: "preparing" | "training" | "privatizing" | "complete" | "error";
  epoch?: number;
  totalEpochs?: number;
  message: string;
};

const DEFAULT_TRAINING_CONFIG: TrainingConfig = {
  epochs: 5,
  batchSize: 32,
  learningRate: 0.001,
  privacy: {
    clipNorm: 1.0,
    noiseSigma: 0.01,
    sparseThreshold: 1e-4,
    quantize: false,
  },
};

export class FederatedTrainer {
  private modelManager: ModelManager;
  private sessionHistory: SessionHistory;
  private config: TrainingConfig;
  private onProgress?: (progress: TrainingProgress) => void;

  constructor(
    modelManager: ModelManager,
    sessionHistory: SessionHistory,
    config: Partial<TrainingConfig> = {},
    onProgress?: (progress: TrainingProgress) => void,
  ) {
    this.modelManager = modelManager;
    this.sessionHistory = sessionHistory;
    this.config = { ...DEFAULT_TRAINING_CONFIG, ...config };
    this.onProgress = onProgress;
  }

  /**
   * Execute the full post-exam training pipeline.
   *
   * Returns null if there are too few samples for training.
   */
  async train(): Promise<TrainingResult | null> {
    const startTime = Date.now();

    this.report({ stage: "preparing", message: "Extracting training data…" });

    // 1. Extract training samples
    const samples = this.sessionHistory.extractSamples();
    if (samples.length < 2) {
      this.report({ stage: "error", message: "Insufficient training data." });
      return null;
    }

    // 2. Snapshot pre-training weights
    const preWeights = this.modelManager.getWeights();
    if (preWeights.length === 0) {
      this.report({ stage: "error", message: "Model not loaded." });
      return null;
    }
    const preFlat = flattenWeights(preWeights);

    // 3. Train locally
    this.report({
      stage: "training",
      epoch: 0,
      totalEpochs: this.config.epochs,
      message: "Starting local training…",
    });

    const tf = await this.modelManager.loadTf();
    if (!tf) {
      this.report({ stage: "error", message: "TensorFlow.js not available." });
      return null;
    }

    const model = this.modelManager.getModel();
    if (!model) {
      this.report({ stage: "error", message: "Model not initialized." });
      return null;
    }

    // Prepare tensors
    const { xs, ys } = this.samplesToTensors(tf, samples);

    try {
      for (let epoch = 0; epoch < this.config.epochs; epoch++) {
        await model.fit(xs, ys, {
          batchSize: this.config.batchSize,
          epochs: 1,
          shuffle: true,
          verbose: 0,
        });

        this.report({
          stage: "training",
          epoch: epoch + 1,
          totalEpochs: this.config.epochs,
          message: `Epoch ${epoch + 1}/${this.config.epochs} complete`,
        });
      }
    } finally {
      xs.dispose();
      ys.dispose();
    }

    // 4. Compute delta
    const postWeights = this.modelManager.getWeights();
    const postFlat = flattenWeights(postWeights);

    // 5. Apply DP
    this.report({ stage: "privatizing", message: "Applying privacy protections…" });

    const gradient = privatize(preFlat, postFlat, this.config.privacy);

    const result: TrainingResult = {
      sampleCount: samples.length,
      gradient,
      dpSigma: this.config.privacy.noiseSigma ?? 0.01,
      durationMs: Date.now() - startTime,
    };

    this.report({ stage: "complete", message: "Training complete." });

    return result;
  }

  /**
   * Convert TrainingSamples into TF tensors for training.
   */
  private samplesToTensors(
    tf: any,
    samples: TrainingSample[],
  ): { xs: any; ys: any } {
    const xData: number[] = [];
    const yData: number[] = [];

    for (const sample of samples) {
      xData.push(...sample.features);
      yData.push(sample.label);
    }

    const xs = tf.tensor3d(xData, [samples.length, SEQ_LENGTH, FEATURE_DIM]);
    const ys = tf.tensor2d(yData, [samples.length, 1]);

    return { xs, ys };
  }

  private report(progress: TrainingProgress): void {
    this.onProgress?.(progress);
  }
}
