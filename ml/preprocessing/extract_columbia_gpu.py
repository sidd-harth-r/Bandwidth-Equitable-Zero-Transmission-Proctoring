import os
import argparse
import numpy as np
import cv2
import face_alignment
import torch
from tqdm import tqdm
from pathlib import Path

# Fix for Windows: Disable torch.compile/Triton dependencies
import torch._dynamo
torch._dynamo.config.suppress_errors = True

"""
Columbia Gaze Feature Extraction (PyTorch GPU)
Processes raw images to extract normalized gaze deviation scores (0.0 to 1.0).
Leverages RTX 3050 CUDA acceleration via face-alignment library.
"""

def extract_columbia_gaze(dataset_path: str, output_path: str):
    print(f"Initializing face-alignment model on {'CUDA' if torch.cuda.is_available() else 'CPU'}...")
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    
    # Initialize 2D landmark detector
    fa = face_alignment.FaceAlignment(face_alignment.LandmarksType.TWO_D, device=device, face_detector='sfd')
    
    image_paths = list(Path(dataset_path).rglob("*.jpg")) + list(Path(dataset_path).rglob("*.png"))
    print(f"Found {len(image_paths)} images in {dataset_path}")
    
    if len(image_paths) == 0:
        print("Error: No images found.")
        return

    scores = []
    failed_detections = 0
    
    for img_path in tqdm(image_paths, desc="Processing Images"):
        img = cv2.imread(str(img_path))
        if img is None:
            failed_detections += 1
            scores.append(0.15) # Default/neutral score for failed read
            continue
            
        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        
        # Get landmarks
        preds = fa.get_landmarks(rgb)
        
        if preds is not None and len(preds) > 0:
            landmarks = preds[0]
            
            # face-alignment returns 68 points (standard format). 
            # Eyes are points 36-41 (right) and 42-47 (left)
            # Center of the eye can be approximated by the mean of the eye points
            right_eye_pts = landmarks[36:42]
            
            # Since standard 68 points don't have exact iris tracking, 
            # we approximate gaze deviation by looking at the asymmetry of the pupil 
            # relative to the eye corners. 
            right_inner = right_eye_pts[3]
            right_outer = right_eye_pts[0]
            
            # Rough pupil approximation (center of eye vertically, but offset horizontally based on gaze)
            pupil_approx = np.mean(right_eye_pts, axis=0) 
            
            eye_width = np.linalg.norm(right_outer - right_inner)
            
            # Distance from inner corner to pupil vs outer corner to pupil
            dist_inner = np.linalg.norm(pupil_approx - right_inner)
            dist_outer = np.linalg.norm(pupil_approx - right_outer)
            
            # Normalize to -1 to 1, then map to 0 to 1
            # If looking straight, dist_inner ≈ dist_outer
            asymmetry = (dist_inner - dist_outer) / (eye_width + 1e-6)
            gaze_score = min(1.0, max(0.0, abs(asymmetry) * 2.0))
            
            scores.append(gaze_score)
        else:
            failed_detections += 1
            scores.append(0.15) # Default score for failed detection
            
    scores_array = np.array(scores, dtype=np.float32)
    
    # Save output
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    np.save(output_path, scores_array)
    
    print(f"\nExtraction complete.")
    print(f"Successfully processed: {len(scores) - failed_detections}")
    print(f"Failed detections (assigned default 0.15): {failed_detections}")
    print(f"Saved normalized gaze scores (shape: {scores_array.shape}) to {output_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extract gaze scores from Columbia Gaze dataset.")
    parser.add_argument("--input", type=str, required=True, help="Path to raw Columbia Gaze dataset folder")
    parser.add_argument("--output", type=str, default="./ml/preprocessing/extracted/columbia_gaze_scores.npy", help="Path to save the output .npy file")
    
    args = parser.parse_args()
    extract_columbia_gaze(args.input, args.output)
