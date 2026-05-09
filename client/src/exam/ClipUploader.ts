/**
 * ClipUploader — Tier 2 Clip Encoding and Upload
 *
 * Takes extracted clip frames from the VideoRingBuffer, encodes
 * them as a lightweight binary payload, and uploads via HTTPS
 * with retry logic.
 *
 * Privacy: Clips are only created for Tier 2 events (high-confidence
 * anomalies requiring human review). Each clip is bounded to ~30s
 * around the event. Clips are uploaded to the server and NOT stored
 * locally.
 */

import type { ClipFrames } from "./VideoRingBuffer";

/* ── Types ────────────────────────────────────────────────── */

export interface ClipMetadata {
  sessionId: string;
  studentId: string;
  eventId: string;
  triggerTimestamp: number;
  startTimestamp: number;
  endTimestamp: number;
  frameCount: number;
  durationMs: number;
  tier: string;
}

export interface ClipUploadResult {
  success: boolean;
  clipId: string | null;
  attempts: number;
  error: string | null;
}

/* ── Configuration ────────────────────────────────────────── */

const MAX_UPLOAD_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const UPLOAD_TIMEOUT_MS = 30_000;

/* ── Clip encoding ────────────────────────────────────────── */

/**
 * Encode clip frames into a compact binary format.
 * Format: JSON metadata header + raw frame data.
 *
 * This is a lightweight encoding — not a proper video codec.
 * For production, consider using WebCodecs API or canvas.toBlob().
 */
export function encodeClip(clip: ClipFrames, metadata: ClipMetadata): Blob {
  const header = JSON.stringify({
    ...metadata,
    frames: clip.frames.map((f) => ({
      timestamp: f.timestamp,
      width: f.width,
      height: f.height,
      byteLength: f.pixels.byteLength,
    })),
  });

  const headerBytes = new TextEncoder().encode(header);
  const headerLength = new Uint32Array([headerBytes.byteLength]);

  // Build parts: [4-byte header length] [header JSON] [frame1 pixels] [frame2 pixels] ...
  const parts: BlobPart[] = [
    new Uint8Array(headerLength.buffer),
    headerBytes,
  ];

  for (const frame of clip.frames) {
    const copy = new ArrayBuffer(frame.pixels.byteLength);
    new Uint8Array(copy).set(frame.pixels);
    parts.push(copy);
  }

  return new Blob(parts, { type: "application/octet-stream" });
}

/**
 * Estimate the encoded size of a clip in bytes.
 */
export function estimateClipSize(clip: ClipFrames): number {
  let size = 256; // Approximate header overhead
  for (const frame of clip.frames) {
    size += frame.pixels.byteLength;
  }
  return size;
}

/* ── ClipUploader class ───────────────────────────────────── */

export class ClipUploader {
  private baseUrl: string;
  private pendingUploads: Map<string, AbortController> = new Map();

  constructor(baseUrl = "") {
    this.baseUrl = baseUrl;
  }

  /**
   * Upload a clip with retry logic.
   */
  async upload(
    clip: ClipFrames,
    metadata: ClipMetadata
  ): Promise<ClipUploadResult> {
    const blob = encodeClip(clip, metadata);
    let lastError: string | null = null;

    for (let attempt = 1; attempt <= MAX_UPLOAD_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        this.pendingUploads.set(metadata.eventId, controller);

        const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

        const response = await fetch(
          `${this.baseUrl}/api/v1/clips/${encodeURIComponent(metadata.sessionId)}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/octet-stream",
              "X-Event-Id": metadata.eventId,
              "X-Student-Id": metadata.studentId,
            },
            body: blob,
            signal: controller.signal,
          }
        );

        clearTimeout(timeoutId);
        this.pendingUploads.delete(metadata.eventId);

        if (response.ok) {
          const data = await response.json();
          return {
            success: true,
            clipId: data.clip_id ?? metadata.eventId,
            attempts: attempt,
            error: null,
          };
        }

        lastError = `HTTP ${response.status}: ${response.statusText}`;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        this.pendingUploads.delete(metadata.eventId);
      }

      // Wait before retrying
      if (attempt < MAX_UPLOAD_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt));
      }
    }

    return {
      success: false,
      clipId: null,
      attempts: MAX_UPLOAD_RETRIES,
      error: lastError,
    };
  }

  /**
   * Cancel a pending upload.
   */
  cancelUpload(eventId: string): void {
    const controller = this.pendingUploads.get(eventId);
    if (controller) {
      controller.abort();
      this.pendingUploads.delete(eventId);
    }
  }

  /**
   * Cancel all pending uploads.
   */
  cancelAll(): void {
    for (const controller of this.pendingUploads.values()) {
      controller.abort();
    }
    this.pendingUploads.clear();
  }

  /**
   * Get the number of pending uploads.
   */
  getPendingCount(): number {
    return this.pendingUploads.size;
  }
}
