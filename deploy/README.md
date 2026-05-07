# chat-admin-panel deploy bundle

This folder contains release-bundle artifacts used by CI/CD for develop and production deploys.

## App-level production deploy contract

- Production app deploy uses only:
  - `DEPLOY_ENV`
  - `SERVICE_NAME`
  - `SERVER_APPS_ROOT`
  - `SERVER_RUNTIME_ENV_FILE`
  - `SERVER_PORT`
  - `HEALTHCHECK_URL`
- Secrets required by the workflow:
  - `SERVER_HOST`
  - `SERVER_USER`
  - `SERVER_SSH_KEY`
  - `SERVER_SSH_KNOWN_HOSTS`
  - `GHCR_PULL_USERNAME`
  - `GHCR_PULL_TOKEN`
- App-level deploy must not require or validate `SERVER_INFRA_ROOT`.
- Remote app path derives as:
  - `APP_DIR="$SERVER_APPS_ROOT/$SERVICE_NAME"`
  - `RELEASE_DIR="$APP_DIR/current"`

## Production runtime env baseline

The server runtime env file is required even for this static panel so compose, host-port routing, and health checks stay app-scoped.

Example:

```env
NODE_ENV=production
CHAT_ADMIN_PANEL_HOST_PORT=3402
```

Recommended GitHub Environment production vars:

- `DEPLOY_ENV=production`
- `SERVICE_NAME=chat-admin-panel`
- `SERVER_APPS_ROOT=/opt/hacom-prod/apps`
- `SERVER_RUNTIME_ENV_FILE=/opt/hacom-prod/env/production/chat-admin-panel.env`
- `HEALTHCHECK_URL=http://127.0.0.1:3402/healthz`

`HEALTHCHECK_URL` must be an absolute `http://` or `https://` URL. Do not use a path-only value like `/healthz`.

## Compose files

- deploy/compose/develop.yml
- deploy/compose/production.yml

## Scripts

- deploy/scripts/deploy.sh
- deploy/scripts/rollback.sh

## Runtime routing

chat-admin-panel is exposed through a dedicated admin origin such as `https://admin.example.com/`.
The panel bundle is rooted at `/` on that host and calls only:

- `/api/v1/auth/*`
- `/api/v1/admin/*`

The admin container serves static assets only. Public routing is owned by the edge proxy, not by the panel container.

If the edge must publish the panel under `/admin`, keep the bundle rooted at `/` and rewrite at the proxy layer instead of rebuilding with a `/admin` asset base. Example:

```nginx
location /admin/ {
    rewrite ^/admin/(.*)$ /$1 break;
    proxy_pass http://chat-admin-panel;
}
```

## Static asset rollout checks

Every release must preserve these static-serving invariants:

- The Vite bundle stays rooted at `/` and emits files under `/assets/`.
- `dist/` must be rebuilt from a clean output directory before the image is created.
- `index.html` must be served with `Cache-Control: no-store, no-cache, must-revalidate`.
- Hashed assets under `/assets/*` must be served as the real file with `Cache-Control: public, immutable`.
- Missing `/assets/*` requests must return `404`, never SPA fallback HTML.
- Do not mount a host volume over `/usr/share/nginx/html`; let the image own the full release bundle.
- All running replicas for the admin host must use the same image digest before traffic is considered healthy.
- The runtime Nginx config is copied as a static file into `/etc/nginx/conf.d/default.conf`; do not route it through `/etc/nginx/templates` because envsubst would rewrite Nginx variables like `$uri`.

Recommended smoke checks before and after deploy:

```bash
curl -I https://admin.example.com/
curl -I https://admin.example.com/assets/<main-css>.css
curl -I https://admin.example.com/assets/<main-js>.js
curl -I https://admin.example.com/assets/__missing__.css
```

Expected results:

- `/` returns `200 text/html` with `Cache-Control: no-store, no-cache, must-revalidate`
- existing CSS returns `200 text/css`
- existing JS returns `200 application/javascript` or `text/javascript`
- missing CSS returns `404` and never `text/html`

If the asset hash set changes and operators still see stale chunk or preload errors:

1. Purge CDN/Cloudflare cache for the dedicated admin host.
2. Hard reload the browser after the purge.
3. Confirm the public host and every replica serve the same `index.html` asset hashes.

## Phase 4 write rollout notes (develop)

- Build-time flag `VITE_ADMIN_WRITE_ACTIONS_ENABLED` must be explicitly set to `true` only when backend write paths are verified.
- Keep this flag aligned with backend runtime toggle `ADMIN_WRITE_ENABLED` in chat-admin-service to avoid UI/backend mismatch.
- Recommended preflight before enabling:
  - rollback drill for chat-admin-service, chat-admin-panel, and chat-auth-service completed
  - write smoke tests passed: lock/unlock/revoke sessions and HR create/update/delete
  - audit logs show actor, target entity, requestId, and action result

## Phase 5 hardening notes

- Role-aware UI gating is enabled:
  - user write actions require `super_admin` or `operator`
  - HR write actions require `super_admin`, `operator`, or `hr_admin`
- Auth state is persisted in `sessionStorage` instead of `localStorage` to reduce token persistence risk.
- Nginx runtime template applies security headers (`X-Frame-Options`, `X-Content-Type-Options`, `CSP`, `Referrer-Policy`, `Permissions-Policy`).
- Admin browser traffic should stay isolated to the admin host so cookies, CSP, browser history, and access logs do not overlap with the end-user app.
