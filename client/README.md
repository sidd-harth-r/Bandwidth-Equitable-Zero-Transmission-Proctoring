# Client

Browser-based exam client.

Planned responsibilities:

- Pre-exam verification and calibration.
- Web Worker inference channels.
- Coordinator, fusion, and tier classification.
- IndexedDB local session storage.
- WebRTC score transmission.
- HTTPS clip and gradient upload.
- Service Worker offline queue and model cache.

Do not transmit raw continuous video from this application.

## Phase 1 Status

The current client contains a Vite/TypeScript shell with a frame-driven pose/gaze worker pipeline. It produces derived numerical scores only, stores them in IndexedDB, and sends scores over WebRTC DataChannel with HTTP fallback to the Phase 1 backend.

Run locally:

```bash
npm install
npm run dev
```
