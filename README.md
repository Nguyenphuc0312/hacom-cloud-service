# chat-admin-panel

Vite + React admin UI for the chat platform.

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

The production bundle uses `/api/v1` as its base path and Nginx forwards that traffic to `ADMIN_API_UPSTREAM`.
