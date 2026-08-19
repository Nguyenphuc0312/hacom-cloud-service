# chat-web-client

Vite + React chat SPA.

`chat-infrastructure` owns the platform runtime contract for `develop` and production:

- shared network: [`chat-infrastructure/contracts/runtime/develop.md`](/d:/Workspace/hacom_holding_dx/projects/chat-infrastructure/contracts/runtime/develop.md)
- platform compose: [`chat-infrastructure/compose/infra/develop.yml`](/d:/Workspace/hacom_holding_dx/projects/chat-infrastructure/compose/infra/develop.yml)

This repo owns the web image and rollout. `develop` deploy artifacts live under [`deploy/`](/d:/Workspace/hacom_holding_dx/projects/chat-web-client/deploy).

## Runtime

- Dev port: `5100`
- Production container port: `80`
- Package manager: `npm`

## Local host mode

```bash
cp .env.example .env
make install
make dev
```

Vite dev server proxies local backend targets out of the box:

- `/api/v1/auth` -> `http://localhost:3101`
- `/api/v1` -> `http://localhost:3001`
- `/ws` -> `ws://localhost:8001`

Override with env vars when needed:

- `VITE_DEV_API_PROXY_TARGET`
- `VITE_DEV_AUTH_PROXY_TARGET`
- `VITE_DEV_WS_PROXY_TARGET`

Environment contract for frontend runtime:

- `VITE_API_BASE_URL`: API base path or absolute URL
- `VITE_AUTH_BASE_URL`: auth base path or absolute URL (canonical `/api/v1/auth`)
- `VITE_WS_BASE_URL`: WebSocket base URL (`/ws`, `ws://...`, or `wss://...`)
- `VITE_FILE_BASE_URL`: optional base origin for resolving relative media URLs (attachments/avatar)

### Run frontend local + backend dev-public

1. Copy the dedicated hybrid template:

```bash
cp .env.dev.frontend-with-develop.example .env
```

2. Replace `develop.example.com` with the actual shared dev host.

3. Run local frontend:

```bash
make dev
```

Notes:

- Absolute `https://` and `wss://` values skip Vite proxy and call backend directly.
- If backend uses cookie refresh mode, CORS must allow origin `http://localhost:5100` and `credentials=true`.
- Keep callback/redirect URLs configured in backend to match frontend origin during local run.

Build and preview the production bundle:

```bash
make build
make start
```

## Docker

The image is built from the monorepo root because the app consumes `../chat-shared-types`.

```bash
make docker-build
make docker-run
make docker-logs
make docker-stop
```

Production containers compile the app with relative paths:

- API: `/api/v1`
- Auth: `/api/v1/auth`
- WebSocket: `/ws`

`chat-web-client` serves static assets only. Public backend routing is owned by `edge-proxy`, not by the web-client container.

## Develop deploy

- runtime alias on `chat-platform`: `chat-web-client`
- release root on server: `${SERVER_APPS_ROOT}/${SERVICE_NAME}/releases/<git-sha>`
- no runtime env file is required for `develop`
- public route ownership stays in `chat-infrastructure/docker/nginx/develop.conf`
