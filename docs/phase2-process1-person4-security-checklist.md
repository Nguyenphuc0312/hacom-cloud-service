# Phase 2 Process 1 — Person 4 security acceptance checklist

## Contract and ownership

- [x] Cloud remains an independent Go service; no Cloud business route is moved into Chat API.
- [x] Public `/cloud-api` and upstream `/api/v1/cloud` route ownership are explicit.
- [x] Phase 1 endpoint names and error envelope remain compatible.
- [x] `chat-auth-service` is the only identity/session/account-state authority.
- [x] Cloud never queries the Auth database and never receives a private signing key.

## Token boundary

- [x] Bearer, JWKS, pinned algorithm, issuer, audience, expiry and access-token type are documented.
- [x] `sub`, `sid`, `jti`, `iat` and `exp` are required; owner comes only from `sub`.
- [x] Refresh/service/admin token rejection is part of the executable contract suite.
- [x] Missing/invalid/revoked/inactive/unavailable error codes are frozen.
- [x] Protected writes fail closed when session/account authority is unavailable.
- [x] Demo identity is local/test only and cleared by the public gateway.

## HTTP and gateway

- [x] Same-origin `/cloud-api` avoids wildcard credentialed CORS.
- [x] Nginx reference forwards Authorization and clears `X-Demo-User-ID`.
- [x] Rate limit uses a bounded per-client zone and burst.
- [x] Trusted edge creates `X-Request-ID`; proxy/request headers are not identity.
- [x] Gateway timeouts are finite and Cloud health endpoints remain available.
- [x] Cross-owner and missing resources use the same `404` contract.

## Test and evidence

- [x] Static gateway/OpenAPI/env tests are included in `make test-gate1-person4`.
- [x] `make test-gate1` now aggregates Cloud, migration, Auth, Shared Types,
  Web, Infrastructure and mandatory live evidence without accepting skips.
- [x] Live acceptance rejects an empty/private/unsupported JWKS and checks
  ownership isolation in both User A -> User B and User B -> User A directions.
- [x] Live Go contract tests accept only environment-issued Auth/test-key tokens.
- [x] Postman covers valid, missing, expired, wrong-type, revoked and owner-spoof cases.
- [x] Test output does not print bearer tokens, private keys or presigned URLs.

## External backend boundary — 2026-08-05

- [x] Cloud/Web gate is executable without changing or building external DX backends.
- [x] Production verifier remains fail-closed; no HS256 compatibility bypass exists.
- [ ] **DEFERRED — Auth owner:** asymmetric tokens/JWKS and live lifecycle fixtures.
- [ ] **DEFERRED — Infrastructure owner:** production edge/header/CORS smoke evidence.
- [ ] **DEFERRED — cross-service:** live two-owner and revocation E2E acceptance.
- [ ] Live Auth/JWKS suite passes after Person 1 wires the production verifier.
- [ ] User A/User B integration fixtures are issued by `chat-auth-service` test authority.
- [ ] Infrastructure owner has merged the reviewed gateway snippet into canonical edge config.

The last three checks are integration dependencies, not missing Person 4 artifacts.
They must be evidenced before the four-person Gate 1 can be marked passed.
