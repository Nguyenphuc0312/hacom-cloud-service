# Hacom Cloud ↔ Hacom Holding DX backend contract negotiation

Date prepared: 05/08/2026  
Owner of this document: Hacom Cloud team  
Implementation owner for requested external changes: Hacom Holding DX teams

## 1. Boundary and purpose

Hacom Cloud does not modify the Auth, Admin, Infrastructure or Notification
backends owned by Hacom Holding DX. This document records the minimum external
contracts needed to complete the live portions of Phase 2 Gates 1–3. It is a
negotiation/handoff artifact, not authorization to change those services.

The Cloud team may implement `chat-web-client` screens against the frozen Cloud
API. Frontend success does not replace backend security or E2E evidence.

## 2. Auth backend requests

### AUTH-01 — asymmetric production identity

Current evidence: production access tokens use `HS256`, contain no `kid`, and
the production JWKS endpoint responds with an empty `keys` array.

Requested contract:

- issue access tokens using `RS256` or `ES256`;
- include a stable `kid` in every token header;
- publish the matching active public key through JWKS;
- define stable issuer and Cloud audience values;
- document key overlap/rotation and cache-control behavior;
- never share an HMAC or private signing secret with Cloud.

Acceptance evidence: valid, expired, wrong-audience, unknown-`kid`, rotated-key,
revoked-session and inactive-account fixtures from a controlled integration
environment. Cloud must pass and fail closed according to its auth contract.

### AUTH-02 — live account and permission authority

Requested contract:

- an internal authenticated principal/account-state check suitable for Cloud;
- a fresh admin permission check for exact permission `cloud.quota.review`;
- revocation and inactive-account semantics, timeout budget and error mapping;
- a service-client provisioning flow that never exposes secrets to browsers.

Acceptance evidence: removing the permission or revoking the session is honored
without waiting for a stale browser token to expire.

### AUTH-03 — service credential for Admin → Cloud

Requested token properties:

- caller/service identity: Admin backend, not the browser;
- audience: `hacom-cloud-service`;
- exact scope: `cloud.quota.review`;
- short expiry, rotation and revocation procedure;
- no user-supplied admin actor header.

## 3. Infrastructure backend requests

Requested edge contract for `/cloud-api`:

- route to Hacom Cloud without changing the frozen `/api/v1/cloud` paths;
- forward `Authorization` and a validated/generated `X-Request-ID`;
- strip local-demo identity headers and any browser-supplied admin actor header;
- enforce approved origins, request/body limits and rate limits;
- preserve range/download response headers without logging presigned URLs;
- publish readiness/timeout/retry behavior and correlation-ID rules.

Acceptance evidence: allowed-origin login-to-Cloud smoke test, denied origin,
missing/invalid bearer, header-spoof attempt, ranged access and request tracing.

## 4. Admin backend requests

The browser calls Admin backend only. Admin backend must:

1. authenticate the browser administrator;
2. obtain a fresh permission decision from Auth;
3. derive the actor UUID from that verified principal;
4. call Cloud with its service credential, operation ID and request ID;
5. never accept actor identity, resulting quota or audit fields from browser JSON.

Cloud remains the sole owner of the quota transaction, state transition and
terminal audit record. Required API/error/idempotency details are frozen in
`docs/openapi/phase3-admin-quota.openapi.yaml` and
`docs/phase3-admin-quota-review.md`.

Acceptance evidence:

- approve and reject by an authorized administrator;
- permission removal fails closed;
- exact retry returns the same decision with `applied=false`;
- reused operation ID with different input is rejected;
- two concurrent reviewers cannot both decide a pending request;
- request ID and verified actor match the Cloud audit row.

## 5. Notification backend requests

Cloud owns only the transactional outbox boundary. The Notification team must
agree on:

- event names/version and payload schema for request-created and review-result;
- consumer authentication and ownership;
- at-least-once delivery, deduplication key and retry/dead-letter policy;
- payload minimization: no reason/note text, object key, file content or token;
- delivery metrics and operational replay procedure.

Acceptance evidence: duplicate delivery is harmless, unavailable consumer is
retried, dead-letter/replay is observable, and the Cloud transaction never
depends synchronously on Notification availability.

## 6. Frontend scope allowed now

The Hacom Cloud team may change `chat-web-client` to implement:

- chat-style Active/Trash timelines;
- move to Trash, restore and delete-now confirmation;
- active/trash byte breakdown and 24-hour retention information;
- owner-scoped search/filter with stable pagination;
- user quota-request submission/status;
- UI states for unavailable external admin/notification integrations.

The frontend must use the existing authenticated transport, must not embed a
service secret, and must not simulate a production permission decision.

## 7. Release decision

Until the respective backend owners accept and implement these contracts:

- Cloud-owned Gate 1/2/3 checks may be marked PASS independently;
- authorized frontend readiness may be marked PASS independently;
- Auth/Admin/Infrastructure/Notification and live cross-service criteria remain
  **DEFERRED**, never silently skipped or reported as PASS;
- no compatibility bypass (especially shared-secret HS256) may be introduced.
