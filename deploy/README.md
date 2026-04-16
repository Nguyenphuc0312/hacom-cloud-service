# chat-admin-panel deploy bundle

This folder contains release-bundle artifacts used by CI/CD for server-test and production deploys.

## Compose files

- deploy/compose/server-test.yml
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

## Phase 4 write rollout notes (server-test)

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
