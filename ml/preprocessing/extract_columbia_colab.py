import os
import argparse
import numpy as np
import cv2
import face_alignment
import torch
from tqdm import tqdm
from pathlib import Path

"""
Columbia Gaze Feature Extraction (Google Colab - GPU)
Processes raw images to extract normalized gaze deviation scores (0.0 to 1.0).
Optimized for Colab environments with periodic status printing.
"""

def extract_columbia_gaze(dataset_path: str, output_path: str, log_interval: int = 100):
    print(f"Initializing face-alignment model on {'CUDA' if torch.cuda.is_available() else 'CPU'}...")
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    
    # Initialize 2D landmark detector
    fa = face_alignment.FaceAlignment(face_alignment.LandmarksType.TWO_D, device=device, face_detector='sfd')
    
    image_paths = sorted(list(Path(dataset_path).rglob("*.jpg")) + list(Path(dataset_path).rglob("*.png")))
    total_images = len(image_paths)
    print(f"Found {total_images} images in {dataset_path}")
    
    if total_images == 0:
        print("Error: No images found.")
        return

    scores = []
    failed_detections = 0
    
    print("Starting extraction...")
    for idx, img_path in enumerate(image_paths):
        # Periodically print status for tracking
        if (idx + 1) % log_interval == 0:
            print(f"Status: Processed {idx + 1}/{total_images} images ({((idx + 1)/total_images)*100:.1f}%)")

        img = cv2.imread(str(img_path))
        if img is None:
            failed_detections += 1
            scores.append(0.15)
            continue
            
        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        preds = fa.get_landmarks(rgb)
        
        if preds is not None and len(preds) > 0:
            landmarks = preds[0]
            # Eye landmarks: 36-41 (right)
            right_eye_pts = landmarks[36:42]
            
            # Approximate pupil position via mean
            pupil_approx = np.mean(right_eye_pts, axis=0) 
            right_inner = right_eye_pts[3]
            right_outer = right_eye_pts[0]
            
            eye_width = np.linalg.norm(right_outer - right_inner)
            dist_inner = np.linalg.norm(pupil_approx - right_inner)
            dist_outer = np.linalg.norm(pupil_approx - right_outer)
            
            asymmetry = (dist_inner - dist_outer) / (eye_width + 1e-6)
            gaze_score = min(1.0, max(0.0, abs(asymmetry) * 2.0))
            scores.append(gaze_score)
        else:
            failed_detections += 1
            scores.append(0.15)
            
    scores_array = np.array(scores, dtype=np.float32)
    
    # Save output
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    np.save(output_path, scores_array)
    
    print(f"\nExtraction complete.")
    print(f"Successfully processed: {len(scores) - failed_detections}")
    print(f"Failed detections: {failed_detections}")
    print(f"Saved results to: {output_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extract gaze scores (Colab GPU Version)")
    parser.add_argument("--input", type=str, required=True, help="Path to raw Columbia Gaze dataset folder")
    parser.add_argument("--output", type=str, required=True, help="Path to save the output .npy file")
    parser.add_argument("--log-interval", type=int, default=100, help="Print status every N images")
    
    args = parser.parse_args()
    extract_columbia_gaze(args.input, args.output, args.log_interval)
