# chat-web-client

Vite + React chat SPA.

Canonical container orchestration lives in [`chat-infrastructure/compose/local/compose.yml`](/d:/Workspace/hacom_holding_dx/projects/chat-infrastructure/compose/local/compose.yml).

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
- Auth: `/auth-api/v1`
- WebSocket: `/ws`

Nginx proxies those paths to upstream services via `API_UPSTREAM`, `AUTH_UPSTREAM`, and `WS_UPSTREAM`.
