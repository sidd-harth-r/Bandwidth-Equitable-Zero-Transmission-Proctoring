import os
import argparse
import numpy as np
from pathlib import Path
import scipy.io as sio

def process_normalized_mpiigaze(input_path: str, output_path: str, sample_size: int = 20000):
    print(f"Loading MPIIGaze Normalized .mat files from: {input_path}")
    
    raw_scores = []
    mat_files = list(Path(input_path).rglob("*.mat"))
    print(f"Found {len(mat_files)} .mat files.")
    
    if not mat_files:
        print("Error: No .mat files found.")
        return

    for mat_file in mat_files:
        try:
            mat_data = sio.loadmat(str(mat_file))
            if 'data' in mat_data:
                for eye in ['right', 'left']:
                    if eye in mat_data['data'].dtype.names:
                        gaze = mat_data['data'][eye][0, 0]['gaze'][0, 0]
                        deviation = np.linalg.norm(gaze, axis=1)
                        norm_deviation = np.clip(deviation / np.pi, 0.0, 1.0)
                        raw_scores.extend(norm_deviation.tolist())
        except Exception as e:
            pass
            
    raw_scores = np.array(raw_scores, dtype=np.float32)
    print(f"Loaded {len(raw_scores)} total records.")
    
    if len(raw_scores) > sample_size:
        print(f"Sampling {sample_size} records from {len(raw_scores)}...")
        np.random.seed(42)
        final_scores = np.random.choice(raw_scores, size=sample_size, replace=False)
    else:
        final_scores = raw_scores
        
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    np.save(output_path, final_scores)
    
    print(f"\nProcessing complete.")
    print(f"Saved normalized gaze scores (shape: {final_scores.shape}) to {output_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Process pre-normalized MPIIGaze dataset.")
    parser.add_argument("--input", type=str, required=True, help="Path to MPIIGaze Normalized dir")
    parser.add_argument("--output", type=str, default="./ml/preprocessing/extracted/mpiigaze_gaze_scores.npy", help="Path to save the output .npy file")
    parser.add_argument("--sample", type=int, default=20000, help="Number of records to sample")
    
    args = parser.parse_args()
    process_normalized_mpiigaze(args.input, args.output, args.sample)
