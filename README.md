# chat-admin-panel

Vite + React admin UI for the chat platform.

Canonical infrastructure orchestration lives in chat-infrastructure/compose/infra/server-test.yml.

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

Vite dev server proxies API/auth calls to local services by default:

- `/api/v1/admin` -> `http://localhost:3201`
- `/api/v1/auth` -> `http://localhost:3101`
- `/api/v1` -> `http://localhost:3201`

Override with these env vars when needed:

- `VITE_DEV_ADMIN_PROXY_TARGET`
- `VITE_DEV_AUTH_PROXY_TARGET`

Runtime envs for hybrid dev:

- `VITE_API_BASE_URL`: shared API base (`/api/v1` or absolute URL)
- `VITE_ADMIN_API_BASE_URL`: admin API root (`/api/v1/admin` or absolute URL)
- `VITE_ADMIN_API_ROOT`: canonical admin API root (`/api/v1/admin` or absolute URL)
- `VITE_AUTH_BASE_URL`: canonical auth root (`/api/v1/auth` or absolute URL)

Run local admin panel with server-test backends:

```bash
cp .env.dev.frontend-with-server-test.example .env
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
- `VITE_ADMIN_API_BASE_URL` remains as a compatibility fallback and must resolve to the same admin root as `VITE_ADMIN_API_ROOT`.
- API client convention:
  - shared client base URL owns `/api/v1`
  - admin client base URL owns `/api/v1/admin`
  - service endpoints stay relative, for example `/monitoring/overview` or `/users`
