# Environment Setup

## 1. Environment Name

Use the environment name `proctor` for all local project work.

```bash
conda env create -f environment.yml
conda activate proctor
```

If the environment already exists:

```bash
conda env update -n proctor -f environment.yml
conda activate proctor
```

## 2. Required Tools

Install these outside this repository:

- Git.
- Conda or Mamba.
- Docker Desktop or Docker Engine.
- Chromium-based browser with camera, microphone, WebRTC, WebGL, IndexedDB, and Service Worker support.
- Wireshark for privacy and packet validation.
- Optional: WSL or Linux VM for `tc` network shaping.

## 3. Python Backend Setup

The Python dependencies are defined in [../../environment.yml](../../environment.yml). Phase 1 backend work should later add pinned project dependencies in `server/pyproject.toml`.

Expected backend services:

- FastAPI app on port `8000`.
- PostgreSQL on port `5432`.
- Redis on port `6379`.
- Nginx in production or production-like testing.

## 4. Client Setup

The planned client stack is TypeScript, TensorFlow.js, MediaPipe, Web Workers, AudioWorklet, IndexedDB through `idb`, WebRTC, and Service Worker.

When Phase 1 coding begins:

```bash
cd client
npm install
npm run dev
```

Expected local client port: `5173`.

## 5. Proctor Dashboard Setup

The proctor dashboard can share the client frontend toolchain but should remain a separate app because its data access, roles, and UI workflows are different.

Expected local dashboard port: `5174`.

## 6. Local Services

After backend code is added, use:

```bash
docker compose -f infrastructure/docker/docker-compose.dev.yml up
```

Required development services:

- PostgreSQL 15 with TimescaleDB extension.
- Redis 7 with RedisJSON if available.
- FastAPI backend.
- Optional local Nginx reverse proxy.

## 7. Environment Variables

Copy [.env.example](../../.env.example) to `.env` and replace placeholder values.

Never commit real secrets, OAuth client secrets, private keys, production database passwords, or real packet captures.

## 8. Hardware For Validation

Use at least three device profiles where possible:

- Low: older laptop or low-end integrated GPU.
- Mid: typical student laptop.
- High: modern laptop with stronger CPU/GPU.

Record:

- CPU model.
- RAM.
- Browser version.
- Camera resolution.
- Operating system.
- Network profile.

## 9. Browser Permissions

Testing requires:

- Camera permission.
- Microphone permission.
- Local storage/IndexedDB enabled.
- Service Worker enabled.
- WebGL enabled.

Browser permission prompts must clearly explain purpose before requesting access.

## 10. Outside-Environment Responsibilities

You will need to perform or arrange:

- GitHub authentication and branch protection decisions.
- Docker installation.
- Browser and webcam tests on a real machine.
- Wireshark packet captures.
- Network shaping with admin privileges.
- Controlled participant testing with consent.
- Institutional OAuth/LMS details if real integration is required.
