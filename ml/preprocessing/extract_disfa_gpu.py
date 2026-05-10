import os
import argparse
import numpy as np
import pandas as pd
from pathlib import Path

"""
DISFA AU Extraction (Normalization Gate)
DISFA+ provides per-frame AU intensity labels in CSV files (0 to 5 scale).
This script parses the target AUs and applies the Normalization Gate to 
scale them to the required 0.0 to 1.0 range.
"""

# Target AUs related to stress and concentration
TARGET_AUS = ['AU4', 'AU12', 'AU17', 'AU20', 'AU23', 'AU25', 'AU26']
MAX_INTENSITY = 5.0

def extract_disfa_au(dataset_path: str, output_path: str):
    print(f"Scanning for DISFA txt labels in: {dataset_path}")
    all_au_vectors = []
    all_labels = []  # 0=neutral, 1=active
    
    # Locate all trial directories (they contain the AU*.txt files)
    # The structure is Labels/SNXXX/SNXXX/Trial_Dir/AU*.txt
    trial_dirs = set(f.parent for f in Path(dataset_path).rglob("AU*.txt"))
    print(f"Found {len(trial_dirs)} trial directories.")
    
    if len(trial_dirs) == 0:
        print("Error: No AU text files found.")
        return

    for trial_dir in trial_dirs:
        try:
            # Read all target AUs for this trial
            trial_data = {}
            num_frames = 0
            
            for au in TARGET_AUS:
                au_file = trial_dir / f"{au}.txt"
                if au_file.exists():
                    # Read lines, skipping headers starting with '#'
                    with open(au_file, 'r') as f:
                        lines = [l.strip() for l in f.readlines() if not l.startswith('#') and l.strip()]
                    
                    # Extract just the intensity value (the second column)
                    intensities = []
                    for line in lines:
                        parts = line.split()
                        if len(parts) >= 2:
                            intensities.append(float(parts[1]) / MAX_INTENSITY)
                        elif len(parts) == 1:
                            intensities.append(float(parts[0]) / MAX_INTENSITY)
                    
                    trial_data[au] = intensities
                    num_frames = max(num_frames, len(intensities))
            
            if not trial_data:
                continue
                
            # Build the AU vectors frame by frame
            for i in range(num_frames):
                au_intensities = []
                for au in TARGET_AUS:
                    if au in trial_data and i < len(trial_data[au]):
                        au_intensities.append(trial_data[au][i])
                    else:
                        au_intensities.append(0.0)
                
                au_vector = np.array(au_intensities, dtype=np.float32)
                au_score = float(np.mean(au_vector))
                
                all_au_vectors.append(au_vector)
                all_labels.append(1 if au_score > 0.15 else 0)
                
        except Exception as e:
            print(f"Skipping {trial_dir} due to parsing error: {e}")
            continue
            
    if not all_au_vectors:
        print("Error: Could not extract any AU vectors. Check CSV formats.")
        return

    au_array = np.array(all_au_vectors, dtype=np.float32)
    label_array = np.array(all_labels, dtype=np.int32)
    
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    vectors_path = output_path.replace('.npy', '_vectors.npy')
    labels_path = output_path.replace('.npy', '_labels.npy')
    
    np.save(vectors_path, au_array)
    np.save(labels_path, label_array)
    
    neutral_count = np.sum(label_array == 0)
    active_count = np.sum(label_array == 1)
    
    print(f"\nExtraction complete.")
    print(f"Extracted {len(au_array)} total AU vectors.")
    print(f"Neutral frames: {neutral_count}")
    print(f"Active frames:  {active_count}")
    print(f"Saved vectors to {vectors_path}")
    print(f"Saved labels to {labels_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extract AU scores from DISFA dataset CSVs.")
    parser.add_argument("--input", type=str, required=True, help="Path to DISFA ActionUnit_Labels directory")
    parser.add_argument("--output", type=str, default="./ml/preprocessing/extracted/disfa_au.npy", help="Base path for output .npy files")
    
    args = parser.parse_args()
    extract_disfa_au(args.input, args.output)
