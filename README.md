# chat-admin-panel

Vite + React admin UI for the chat platform.

Canonical container orchestration lives in [`chat-infrastructure/compose/local/compose.yml`](/d:/Workspace/hacom_holding_dx/projects/chat-infrastructure/compose/local/compose.yml).

## Runtime

- Dev port: `5174`
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

```bash
make docker-build
make docker-run
make docker-logs
make docker-stop
```

Canonical admin API root is `/api/v1/admin`.

- `VITE_ADMIN_API_ROOT` is the preferred source of truth for admin-only routes.
- `VITE_ADMIN_API_BASE_URL` remains as a compatibility fallback for shared `/api/v1/*` callers such as auth, alerts, and metrics.
