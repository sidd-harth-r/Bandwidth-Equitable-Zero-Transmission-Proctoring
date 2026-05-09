import { describe, it, expect } from "vitest";
import {
  clipL2,
  addGaussianNoise,
  sparsify,
  quantize8bit,
  dequantize8bit,
  privatize,
} from "../src/ml/PrivacyEngine";

describe("PrivacyEngine", () => {
  // ── L2 Clipping ─────────────────────────────────────────

  describe("clipL2", () => {
    it("should not modify gradients within the clip norm", () => {
      const grad = new Float32Array([0.1, 0.2, 0.3]);
      const clipped = clipL2(grad, 10.0);
      expect(clipped[0]).toBeCloseTo(0.1);
      expect(clipped[1]).toBeCloseTo(0.2);
      expect(clipped[2]).toBeCloseTo(0.3);
    });

    it("should scale down gradients exceeding the clip norm", () => {
      // norm of [3, 4] = 5
      const grad = new Float32Array([3, 4]);
      const clipped = clipL2(grad, 1.0);
      const norm = Math.sqrt(clipped[0] ** 2 + clipped[1] ** 2);
      expect(norm).toBeCloseTo(1.0, 4);
    });

    it("should preserve direction after clipping", () => {
      const grad = new Float32Array([6, 8]); // norm = 10
      const clipped = clipL2(grad, 5.0);
      // ratio should be preserved: 6/8 = 3/4
      expect(clipped[0] / clipped[1]).toBeCloseTo(6 / 8, 4);
    });
  });

  // ── Gaussian Noise ──────────────────────────────────────

  describe("addGaussianNoise", () => {
    it("should change values when sigma > 0", () => {
      const grad = new Float32Array(100).fill(1.0);
      const noisy = addGaussianNoise(grad, 0.5);
      // At least some values should differ
      let diffCount = 0;
      for (let i = 0; i < grad.length; i++) {
        if (Math.abs(noisy[i] - grad[i]) > 1e-6) diffCount++;
      }
      expect(diffCount).toBeGreaterThan(50);
    });

    it("should not change values when sigma = 0", () => {
      const grad = new Float32Array([1.0, 2.0, 3.0]);
      const noisy = addGaussianNoise(grad, 0);
      expect(noisy[0]).toBeCloseTo(1.0);
      expect(noisy[1]).toBeCloseTo(2.0);
      expect(noisy[2]).toBeCloseTo(3.0);
    });
  });

  // ── Sparsification ──────────────────────────────────────

  describe("sparsify", () => {
    it("should keep values above threshold", () => {
      const grad = new Float32Array([0.5, 0.0001, -0.3, 0.00001, 0.8]);
      const { indices, values } = sparsify(grad, 0.001);
      expect(indices).toEqual([0, 2, 4]);
      expect(values[0]).toBeCloseTo(0.5);
      expect(values[1]).toBeCloseTo(-0.3);
      expect(values[2]).toBeCloseTo(0.8);
    });

    it("should return empty for all-zero gradients", () => {
      const grad = new Float32Array(10).fill(0);
      const { indices, values } = sparsify(grad, 0.001);
      expect(indices.length).toBe(0);
      expect(values.length).toBe(0);
    });
  });

  // ── 8-bit Quantization Reversibility ────────────────────

  describe("quantize8bit / dequantize8bit", () => {
    it("should be reversible within tolerance", () => {
      const original = new Float32Array([0.1, -0.2, 0.3, -0.4, 0.5]);
      const encoded = quantize8bit(original);
      const decoded = dequantize8bit(encoded);

      expect(decoded.length).toBe(original.length);
      for (let i = 0; i < original.length; i++) {
        // 8-bit quantization has ~1% error for values within range
        expect(decoded[i]).toBeCloseTo(original[i], 1);
      }
    });

    it("should handle all-zero input", () => {
      const original = new Float32Array(5).fill(0);
      const encoded = quantize8bit(original);
      const decoded = dequantize8bit(encoded);
      for (let i = 0; i < decoded.length; i++) {
        expect(decoded[i]).toBe(0);
      }
    });

    it("should handle single large value", () => {
      const original = new Float32Array([100.0]);
      const encoded = quantize8bit(original);
      const decoded = dequantize8bit(encoded);
      expect(decoded[0]).toBeCloseTo(100.0, 0);
    });
  });

  // ── Full Pipeline ───────────────────────────────────────

  describe("privatize", () => {
    it("should produce a valid SparseGradient", () => {
      const pre = new Float32Array(100).fill(0);
      const post = new Float32Array(100);
      // Set some weights to non-trivial values
      for (let i = 0; i < 100; i++) post[i] = (i % 10 === 0) ? 0.5 : 0;

      const result = privatize(pre, post, {
        clipNorm: 2.0,
        noiseSigma: 0.001,
        sparseThreshold: 0.01,
        quantize: false,
      });

      expect(result.indices.length).toBeGreaterThan(0);
      expect(result.valuesBase64.length).toBeGreaterThan(0);
      expect(result.quantized).toBe(false);
    });

    it("should produce quantized output when quantize=true", () => {
      const pre = new Float32Array(50).fill(0);
      const post = new Float32Array(50);
      for (let i = 0; i < 50; i++) post[i] = 0.1 * i;

      const result = privatize(pre, post, {
        clipNorm: 10.0,
        noiseSigma: 0,
        sparseThreshold: 0.01,
        quantize: true,
      });

      expect(result.quantized).toBe(true);
      expect(result.valuesBase64.length).toBeGreaterThan(0);
    });

    it("should return fewer indices after sparsification", () => {
      const pre = new Float32Array(1000).fill(0);
      const post = new Float32Array(1000);
      // Only 10 elements have significant change
      for (let i = 0; i < 1000; i++) {
        post[i] = (i < 10) ? 1.0 : 0.00001;
      }

      const result = privatize(pre, post, {
        clipNorm: 100.0,
        noiseSigma: 0,
        sparseThreshold: 0.001,
      });

      // Should be close to 10, not 1000
      expect(result.indices.length).toBeLessThan(50);
      expect(result.indices.length).toBeGreaterThan(5);
    });
  });
});
