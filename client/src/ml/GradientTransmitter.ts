/**
 * GradientTransmitter — Upload privatized gradients to the server
 *
 * This is NOT a Flower client. It is an HTTP client that POSTs
 * serialized gradients to the FastAPI bridge endpoint, which then
 * routes them to the Flower server via Redis.
 *
 * Features:
 * - HTTPS POST with retry (3 attempts, exponential backoff)
 * - Service Worker fallback for offline queueing
 * - Gear-aware payload optimization
 */

import type { SparseGradient } from "./PrivacyEngine";

export interface TransmitPayload {
  sessionId: string;
  studentId: string;
  modelVersion: number;
  gearAtSubmission: number;
  gradient: SparseGradient;
  dpSigma: number;
  sampleCount: number;
}

export interface TransmitResult {
  success: boolean;
  status: string;
  retries: number;
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

export class GradientTransmitter {
  private serverUrl: string;

  constructor(serverUrl = "http://localhost:8000") {
    this.serverUrl = serverUrl;
  }

  /**
   * Upload the privatized gradient to the server.
   * Retries up to MAX_RETRIES times with exponential backoff.
   */
  async transmit(payload: TransmitPayload): Promise<TransmitResult> {
    const body = {
      session_id: payload.sessionId,
      student_id: payload.studentId,
      model_version: payload.modelVersion,
      gear_at_submission: payload.gearAtSubmission,
      quantised: payload.gradient.quantized,
      delta_indices: payload.gradient.indices,
      delta_values: payload.gradient.valuesBase64,
      dp_sigma: payload.dpSigma,
      sample_count: payload.sampleCount,
      timestamp: Date.now(),
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(
          `${this.serverUrl}/api/v1/federated/gradients`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        );

        if (res.ok || res.status === 202) {
          return { success: true, status: "accepted", retries: attempt };
        }

        if (res.status === 429) {
          // Rate limited — wait and retry
          const delay = BASE_DELAY_MS * Math.pow(2, attempt);
          await this.sleep(delay);
          continue;
        }

        // Non-retryable error
        return {
          success: false,
          status: `HTTP ${res.status}`,
          retries: attempt,
        };
      } catch (err) {
        lastError = err as Error;
        // Network error — retry with backoff
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        await this.sleep(delay);
      }
    }

    // All retries failed — attempt Service Worker queue
    this.queueForServiceWorker(body);

    return {
      success: false,
      status: lastError?.message ?? "All retries failed",
      retries: MAX_RETRIES,
    };
  }

  /**
   * Queue the gradient payload for the Service Worker to transmit later.
   * This handles the case where the student closes the browser during upload.
   */
  private queueForServiceWorker(body: Record<string, unknown>): void {
    try {
      if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: "QUEUE_GRADIENT",
          payload: body,
        });
      }
    } catch {
      // Service Worker not available — gradient is lost
      // This is acceptable for the academic demo
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
