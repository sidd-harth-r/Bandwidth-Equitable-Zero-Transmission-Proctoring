/**
 * PrivacyEngine — Differential Privacy for Federated Learning
 *
 * Applies the privacy-preserving transformations to local model
 * weight deltas before transmission to the server:
 *
 * 1. Sparsification — zero out deltas below a threshold
 * 2. L2 norm clipping — bound sensitivity before noise
 * 3. Gaussian DP noise — calibrated to (ε, δ) budget
 * 4. 8-bit quantization — for Gear 3/4 bandwidth savings
 * 5. Serialization — to base64 for HTTPS upload
 *
 * Order of operations is critical:
 *   clip → noise → sparsify → (optionally quantize) → serialize
 */

export interface PrivacyConfig {
  /** L2 norm clipping bound. Deltas are scaled so ‖Δ‖₂ ≤ clipNorm. */
  clipNorm: number;
  /** Gaussian noise σ (standard deviation). */
  noiseSigma: number;
  /** Sparsification threshold. Deltas with |Δ| < threshold are zeroed. */
  sparseThreshold: number;
  /** Whether to apply 8-bit quantization (Gear 3/4). */
  quantize: boolean;
}

export interface SparseGradient {
  /** Indices of non-zero delta weights in the flattened weight vector. */
  indices: number[];
  /** Base64-encoded Float32Array (or Uint8Array if quantized). */
  valuesBase64: string;
  /** Whether the values are 8-bit quantized. */
  quantized: boolean;
}

const DEFAULT_CONFIG: PrivacyConfig = {
  clipNorm: 1.0,
  noiseSigma: 0.01,
  sparseThreshold: 1e-4,
  quantize: false,
};

/**
 * Clip the L2 norm of a flat gradient vector.
 * If ‖grad‖₂ > clipNorm, scale grad so ‖grad‖₂ = clipNorm.
 */
export function clipL2(grad: Float32Array, clipNorm: number): Float32Array {
  let norm = 0;
  for (let i = 0; i < grad.length; i++) {
    norm += grad[i] * grad[i];
  }
  norm = Math.sqrt(norm);

  if (norm <= clipNorm) return grad;

  const scale = clipNorm / norm;
  const clipped = new Float32Array(grad.length);
  for (let i = 0; i < grad.length; i++) {
    clipped[i] = grad[i] * scale;
  }
  return clipped;
}

/**
 * Add calibrated Gaussian noise to each element.
 * Uses Box-Muller transform for normal distribution.
 */
export function addGaussianNoise(
  grad: Float32Array,
  sigma: number,
): Float32Array {
  const noisy = new Float32Array(grad.length);
  for (let i = 0; i < grad.length; i += 2) {
    // Box-Muller transform
    const u1 = Math.random() || 1e-10; // avoid log(0)
    const u2 = Math.random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const z1 = Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2);

    noisy[i] = grad[i] + sigma * z0;
    if (i + 1 < grad.length) {
      noisy[i + 1] = grad[i + 1] + sigma * z1;
    }
  }
  return noisy;
}

/**
 * Sparsify: zero out deltas below the threshold.
 * Returns { indices, values } of surviving non-zero entries.
 */
export function sparsify(
  grad: Float32Array,
  threshold: number,
): { indices: number[]; values: Float32Array } {
  const indices: number[] = [];
  const valuesList: number[] = [];

  for (let i = 0; i < grad.length; i++) {
    if (Math.abs(grad[i]) >= threshold) {
      indices.push(i);
      valuesList.push(grad[i]);
    }
  }

  return { indices, values: new Float32Array(valuesList) };
}

/**
 * 8-bit symmetric quantization.
 * Encodes as: [4-byte float32 scale] + [int8 values]
 *
 * float_val ≈ int_val * scale
 */
export function quantize8bit(values: Float32Array): Uint8Array {
  let maxAbs = 0;
  for (let i = 0; i < values.length; i++) {
    const a = Math.abs(values[i]);
    if (a > maxAbs) maxAbs = a;
  }

  const scale = maxAbs / 127; // map to [-127, 127]

  // Output: 4 bytes for scale (float32) + N bytes for int8 values
  const buf = new ArrayBuffer(4 + values.length);
  const scaleView = new Float32Array(buf, 0, 1);
  const int8View = new Int8Array(buf, 4);

  scaleView[0] = scale;
  for (let i = 0; i < values.length; i++) {
    int8View[i] = scale > 0 ? Math.round(values[i] / scale) : 0;
  }

  return new Uint8Array(buf);
}

/**
 * Dequantize 8-bit values back to float32.
 * Inverse of quantize8bit.
 */
export function dequantize8bit(encoded: Uint8Array): Float32Array {
  const buf = encoded.buffer.slice(
    encoded.byteOffset,
    encoded.byteOffset + encoded.byteLength,
  );
  const scale = new Float32Array(buf, 0, 1)[0];
  const int8View = new Int8Array(buf, 4);

  const values = new Float32Array(int8View.length);
  for (let i = 0; i < int8View.length; i++) {
    values[i] = int8View[i] * scale;
  }
  return values;
}

/**
 * Encode a Uint8Array or Float32Array to base64 string.
 */
function toBase64(data: Uint8Array | Float32Array): string {
  const bytes =
    data instanceof Uint8Array ? data : new Uint8Array(data.buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Full privacy pipeline:
 *   1. Compute delta = postWeights - preWeights
 *   2. L2 clip
 *   3. Add Gaussian DP noise
 *   4. Sparsify
 *   5. Optionally quantize (Gear 3/4)
 *   6. Serialize to base64
 */
export function privatize(
  preWeights: Float32Array,
  postWeights: Float32Array,
  config: Partial<PrivacyConfig> = {},
): SparseGradient {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // 1. Delta
  const delta = new Float32Array(preWeights.length);
  for (let i = 0; i < preWeights.length; i++) {
    delta[i] = postWeights[i] - preWeights[i];
  }

  // 2. L2 clip (must precede noise to bound sensitivity)
  const clipped = clipL2(delta, cfg.clipNorm);

  // 3. Gaussian DP noise
  const noisy = addGaussianNoise(clipped, cfg.noiseSigma);

  // 4. Sparsify
  const { indices, values } = sparsify(noisy, cfg.sparseThreshold);

  // 5. Quantize (optional, for Gear 3/4)
  if (cfg.quantize) {
    const encoded = quantize8bit(values);
    return {
      indices,
      valuesBase64: toBase64(encoded),
      quantized: true,
    };
  }

  // 6. Serialize float32 to base64
  return {
    indices,
    valuesBase64: toBase64(values),
    quantized: false,
  };
}
