# chat-web-client

Vite + React chat SPA.

`chat-infrastructure` owns the platform runtime contract for `server-test` and production:

- shared network: [`chat-infrastructure/contracts/runtime/server-test.md`](/d:/Workspace/hacom_holding_dx/projects/chat-infrastructure/contracts/runtime/server-test.md)
- platform compose: [`chat-infrastructure/compose/infra/server-test.yml`](/d:/Workspace/hacom_holding_dx/projects/chat-infrastructure/compose/infra/server-test.yml)

This repo owns the web image and rollout. `server-test` deploy artifacts live under [`deploy/`](/d:/Workspace/hacom_holding_dx/projects/chat-web-client/deploy).

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
- Auth: `/auth`
- WebSocket: `/ws`

`chat-web-client` serves static assets only. Public backend routing is owned by `edge-proxy`, not by the web-client container.

## Server-test deploy

- runtime alias on `chat-platform`: `chat-web-client`
- release root on server: `${SERVER_APPS_ROOT}/${SERVICE_NAME}/releases/<git-sha>`
- no runtime env file is required for `server-test`
- public route ownership stays in `chat-infrastructure/docker/nginx/server-test.conf`
