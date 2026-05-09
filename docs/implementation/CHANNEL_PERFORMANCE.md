# Detection Channel Performance & Limitations

> Phase 2 documentation — records honest FPS floors, accuracy limits, and
> known constraints for each detection channel.

---

## Channel Performance Summary

| Channel | Target FPS | Min Viable FPS | Frame Size | CPU Impact |
|---------|-----------|---------------|------------|------------|
| PoseGaze | 10 fps | 1.4 fps (700ms interval) | 160×120 | Medium (MediaPipe Pose) |
| rPPG | 10 fps | 1.4 fps (shared frame pump) | 160×120 | Low (green-channel + FIR) |
| AU | 10 fps | 1.4 fps (shared frame pump) | 160×120 | Low (pixel heuristics) / Medium (Face Mesh) |
| Keystroke | N/A (event-driven) | N/A | N/A | Negligible |
| Audio | 5 fps (200ms interval) | 2 fps | 256-bin FFT | Low |

### Frame Pump Architecture

All visual channels (PoseGaze, rPPG, AU) share a single frame pump at **700ms intervals** (~1.4 fps). This is intentionally conservative to:

1. Reduce CPU/power on low-end devices
2. Limit memory pressure from `getImageData()` calls
3. Stay well below any video-recording threshold

The frame is captured at **160×120** resolution (downscaled from 320×240 camera feed) to further reduce per-frame processing cost.

---

## Channel-Specific Limitations

### PoseGaze Worker

**Strengths:**
- MediaPipe Pose provides reliable nose/shoulder detection for head orientation
- Fallback mode (frame-pixel center-of-mass) works without any ML model loading

**Limitations:**
- No true iris/gaze tracking — uses nose-to-shoulder-midpoint vector as proxy
- Shoulder detection fails when shoulders are cropped out of frame
- Dark/backlit environments degrade landmark quality
- Single-person assumption — no multi-person disambiguation

**Honest FPS Floor:** 1.4 fps. Even at this rate, frame-to-frame motion and brightness shifts provide meaningful signal.

### rPPG Worker

**Strengths:**
- Green-channel extraction is computationally cheap (no ML model)
- FIR bandpass filter effectively isolates HR-relevant frequencies
- Signal quality metric prevents low-confidence scores from influencing fusion

**Limitations:**
- **Lighting sensitivity**: Requires stable, front-facing illumination. Fluorescent flicker at 50/60 Hz can inject artifacts.
- **Skin region approximation**: Uses a fixed central ROI (35–65% width, 20–55% height), not actual face segmentation. Off-center faces reduce signal quality.
- **Calibration requirement**: Needs 2 minutes of stable baseline. Cannot produce meaningful scores during calibration.
- **Zero-crossing HR estimation**: Less accurate than peak-detection or FFT-based methods. Accuracy is ±15 BPM for the intended stress-detection use case (sufficient for deviation-from-baseline, not clinical measurement).
- **Motion artifacts**: Head movement corrupts the green-channel signal. No motion compensation is applied.

**Honest FPS Floor:** Requires ≥3 fps for reliable HR estimation. At 1.4 fps, signal quality will be low but still detects gross HR changes.

### AU Worker

**Strengths:**
- Detects 7 action units (AU4, AU12, AU17, AU20, AU23, AU25, AU26) covering stress/tension/deception indicators
- Frame-pixel fallback provides basic emotion proxy without Face Mesh
- Weighted scoring emphasizes stress-associated AUs (AU4 brow lowerer, AU23 lip tightener)

**Limitations:**
- **Landmark mode requires 468+ Face Mesh landmarks**: Currently falls back to pixel heuristics when Face Mesh is not loaded, which produces much less accurate AU estimates.
- **Pixel fallback is crude**: Uses color statistics (redness, brightness) as AU proxies — low specificity.
- **No temporal smoothing**: Frame-by-frame AU computation is noisy; no exponential moving average applied.
- **Calibration is fast (30 frames)**: May not capture full range of neutral expressions.
- **Cultural and individual variation**: AU activation baselines vary significantly across individuals. Per-session calibration partially mitigates but doesn't eliminate this.

**Honest FPS Floor:** Meaningful at ≥1 fps. AU changes are slower than rPPG signals.

### Keystroke Worker

**Strengths:**
- Privacy-preserving: no key content stored, only timing features
- Captures dwell time, flight time, variance, backspace rate, paste ratio
- Paste detection is a strong proxy for copy-paste cheating behavior
- Event-driven: no frame rate dependency

**Limitations:**
- **Requires typing activity**: Cannot produce scores when student is reading, thinking, or solving problems without typing.
- **Baseline calibration needs 200 keystrokes**: Takes ~1–2 minutes of active typing. Short-answer exams may not reach baseline.
- **Shared/accessibility devices**: External keyboards, screen readers, or accessibility tools can alter timing profiles.
- **Language/script effects**: Different scripts (CJK, Arabic) produce different baseline characteristics.

### Audio Analyser

**Strengths:**
- Detects voice activity, multiple speakers, and environmental noise changes
- No raw audio stored or transmitted — only spectral statistics
- Low computational cost (simple FFT)

**Limitations:**
- **Runs in main thread**: AudioWorklet API has limitations; current implementation uses AnalyserNode on main thread.
- **No speaker identification**: Cannot distinguish between the student's voice and background TV/radio.
- **Environmental sensitivity**: HVAC, fans, and street noise affect spectral flatness and energy measurements.
- **Does not contribute directly to ChannelScores**: Currently used for calibration and AU weight adjustment, not as a standalone fusion channel.

---

## Fusion Engine Limitations

- **Equal-interval assumption**: Agreement index uses variance across 4 channels, which assumes channels are roughly calibrated. Channels in calibration phase (score=0) artificially lower the agreement index.
- **No temporal weighting**: Each fusion call is stateless — no time-series analysis of score trends.
- **Fixed weight defaults**: Weights (pose_gaze=0.35, rppg=0.20, au=0.25, keystroke=0.20) are heuristic. No empirical validation against labeled cheating data yet.

---

## Recommendations for Phase 7 Validation

1. Measure per-channel false positive rates on ≥10 legitimate exam sessions
2. Record device specs (CPU, GPU, RAM, browser) for each benchmark session
3. Test rPPG reliability across 3+ lighting conditions
4. Test AU Worker with Face Mesh loaded vs. pixel fallback
5. Measure keystroke baseline convergence time across essay vs. MCQ exam formats
