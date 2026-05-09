"""
Deserialization logic for privatized gradients from clients.
"""

import base64
import numpy as np

# Defined by the 2-layer LSTM architecture in pretrain.py
# (kernel, recurrent_kernel, bias) for LSTM1, LSTM2, and Dense
MODEL_SHAPES = [
    (20, 256), (64, 256), (256,),  # lstm_1
    (64, 256), (64, 256), (256,),  # lstm_2
    (64, 1), (1,)                  # dense
]
TOTAL_WEIGHTS = sum(np.prod(shape) for shape in MODEL_SHAPES)


class GradientDeserializer:
    @staticmethod
    def deserialize(
        quantised: bool,
        delta_indices: list[int],
        delta_values_b64: str
    ) -> list[np.ndarray]:
        """
        Reconstructs the model weight deltas from a sparsified,
        potentially quantised base64 string.
        
        Returns a list of numpy arrays matching the model layer shapes.
        """
        # 1. Decode base64
        raw_bytes = base64.b64decode(delta_values_b64)
        
        # 2. Extract values based on quantization flag
        if quantised:
            # 8-bit quantized: First 4 bytes are float32 scale, rest are int8 values
            scale = np.frombuffer(raw_bytes[:4], dtype=np.float32)[0]
            int8_vals = np.frombuffer(raw_bytes[4:], dtype=np.int8)
            # Dequantize: float_val = int_val * scale
            values = int8_vals.astype(np.float32) * scale
        else:
            # Not quantized: Raw float32 array
            values = np.frombuffer(raw_bytes, dtype=np.float32)
            
        if len(values) != len(delta_indices):
            raise ValueError(f"Mismatch: {len(values)} values but {len(delta_indices)} indices")
            
        # 3. Reconstruct sparse 1D vector
        full_vector = np.zeros(TOTAL_WEIGHTS, dtype=np.float32)
        full_vector[delta_indices] = values
        
        # 4. Reshape back to layer weights
        reconstructed_layers = []
        offset = 0
        for shape in MODEL_SHAPES:
            size = np.prod(shape)
            layer_flat = full_vector[offset : offset + size]
            reconstructed_layers.append(layer_flat.reshape(shape))
            offset += size
            
        return reconstructed_layers

