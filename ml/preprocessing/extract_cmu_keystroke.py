import os
import argparse
import numpy as np
import pandas as pd
import json

"""
CMU Keystroke Dynamics Extraction
Processes the structured CSV to extract population-level dwell and flight time
distributions to establish the behavioral prior for typing rhythm.
"""

def extract_keystroke_stats(dataset_path: str, output_path: str):
    print(f"Loading CMU Keystroke dataset from: {dataset_path}")
    
    try:
        df = pd.read_csv(dataset_path)
    except Exception as e:
        print(f"Error loading CSV: {e}")
        return

    stats = {
        "subjects": [],
        "population": {}
    }
    
    # Identify subject column (usually 'subject')
    subject_col = df.columns[0]
    if 'subject' in df.columns:
        subject_col = 'subject'
        
    # Isolate timing columns
    hold_cols = [c for c in df.columns if c.startswith('H.')]
    flight_cols = [c for c in df.columns if c.startswith('DD.')]
    
    if not hold_cols or not flight_cols:
        print("Error: Could not find 'H.' (hold) or 'DD.' (flight) columns in CSV.")
        return

    all_hold_times = []
    all_flight_times = []
    
    print("Calculating per-subject statistics...")
    for subject_id, group in df.groupby(subject_col):
        hold_values = group[hold_cols].values.flatten()
        flight_values = group[flight_cols].values.flatten()
        
        # Filter negative or anomalous zero values
        hold_values = hold_values[hold_values > 0]
        flight_values = flight_values[flight_values > 0]
        
        if len(hold_values) < 10:
            continue
            
        subject_stats = {
            "id": str(subject_id),
            "hold_mean": float(np.mean(hold_values)),
            "hold_std": float(np.std(hold_values)),
            "flight_mean": float(np.mean(flight_values)),
            "flight_std": float(np.std(flight_values))
        }
        stats["subjects"].append(subject_stats)
        all_hold_times.extend(hold_values.tolist())
        all_flight_times.extend(flight_values.tolist())
    
    print("Calculating population statistics...")
    stats["population"] = {
        "hold_mean": float(np.mean(all_hold_times)),
        "hold_std": float(np.std(all_hold_times)),
        "hold_p5": float(np.percentile(all_hold_times, 5)),
        "hold_p95": float(np.percentile(all_hold_times, 95)),
        "flight_mean": float(np.mean(all_flight_times)),
        "flight_std": float(np.std(all_flight_times)),
        "flight_p5": float(np.percentile(all_flight_times, 5)),
        "flight_p95": float(np.percentile(all_flight_times, 95)),
        "n_subjects": len(stats["subjects"])
    }
    
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w') as f:
        json.dump(stats, f, indent=2)
    
    print(f"\nExtraction complete.")
    print(f"Extracted stats for {len(stats['subjects'])} subjects -> {output_path}")
    print(f"Population hold mean: {stats['population']['hold_mean']:.3f} seconds")
    print(f"Population flight mean: {stats['population']['flight_mean']:.3f} seconds")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extract keystroke stats from CMU dataset.")
    parser.add_argument("--input", type=str, required=True, help="Path to CMU dataset CSV file")
    parser.add_argument("--output", type=str, default="./ml/preprocessing/extracted/cmu_keystroke_stats.json", help="Path to save the output .json file")
    
    args = parser.parse_args()
    extract_keystroke_stats(args.input, args.output)
