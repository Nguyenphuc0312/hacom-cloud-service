# Chat Web Client Release Security Policy

## Token And Session Storage

Current frontend policy:

- Access token default: in-memory only.
- Access tokens are cleared from browser storage during login, refresh, logout,
  and bootstrap migration.
- Refresh token preferred mode: `VITE_REFRESH_TOKEN_STORAGE_MODE=cookie`.
- Fallback body mode keeps refresh tokens in `localStorage` only when
  `rememberMe=true`; otherwise they stay in `sessionStorage`.
- Cookie mode expects the backend to issue and clear an HttpOnly refresh cookie.
- Logout and 401 handling must call token cleanup and remove both localStorage and
  sessionStorage token keys.

Production recommendation:

- Use `VITE_REFRESH_TOKEN_STORAGE_MODE=cookie` with backend-issued HttpOnly
  refresh cookies, CSRF protection, and logout cookie clearing.
- Do not pass WebSocket tokens in query strings unless the deployment explicitly
  requires the compatibility fallback.

Accepted risk until backend confirmation:

- If backend cannot issue HttpOnly refresh cookies, refresh tokens remain
  client-readable. `rememberMe=true` then increases XSS blast radius because the
  refresh token persists in `localStorage` until logout or expiry.

## Message And Attachment Rendering

Message rendering policy:

- Message text is rendered as text, not raw HTML.
- URL previews must use sanitized URL resolution.
- `data:` URLs are blocked by default.
- `data:` image URLs are allowed only for explicit image-preview context and
  only for raster MIME types: png, jpg, jpeg, gif, webp.
- `data:image/svg+xml` and `data:text/html` must not be rendered inline.
- `blob:` URLs require explicit context opt-in.
- External links opened in a new tab must use `rel="noopener noreferrer"`.

## File Viewer Rollout And Telemetry

The in-app chat file viewer is controlled by the public build-time flags
VITE_FILE_VIEWER_ENABLED and VITE_FILE_LIFECYCLE_TELEMETRY_ENABLED. Both are
fail-closed: only the exact value true enables a behavior. They do not gate
upload, explicit download, or native desktop file operations.

When telemetry is enabled, the browser emits only a local
chat:file-viewer-lifecycle CustomEvent with an allowlisted phase, preview kind,
source category, and outcome category. It must never include a file name, path,
object key, URL, signed URL, token, attachment/conversation/account identifier,
or raw error. The event has no network collector in P5 and must not be treated
as an audit log.

Any future server-side lifecycle telemetry requires a separate authenticated,
rate-limited schema and a review of API, storage, and edge logging paths. Do
not forward browser payloads into generic logger metadata.

## Logging

Production logging policy:

- Source code must not call raw `console.*` outside the centralized logger.
- Debug logging is disabled unless a DEV/debug flag explicitly enables it.
- Logger redacts tokens, authorization headers, cookies, credentials, raw
  payload/body/content, email-like strings, and high-cardinality identifiers.
- Socket/message payload logs must not include raw message content in production.

Static gate coverage:

- `npm run gate:static` fails if raw console calls return.
- `npm run gate:static` fails if resource URL policy allows SVG/HTML data URLs.
- `npm run gate:static` fails if the active message timeline leaves RTKQ or if
  WebSocket reintroduces Zustand writes for active messages.
