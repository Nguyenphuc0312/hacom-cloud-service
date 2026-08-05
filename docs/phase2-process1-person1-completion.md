# Phase 2 Process 1 — Person 1 completion report

Date: 2026-08-04

Branch: `integration/phase-2-process-1-baseline-auth`

## Completed scope

- Production access-token verification remains pinned to `RS256|ES256`, JWKS
  `kid`, issuer, audience, `typ=access`, `sub`, `sid`, `jti`, `iat` and `exp`.
- Owner identity remains derived only from the verified `sub`; demo and proxy
  identity headers cannot override it in JWT mode.
- Redis JTI/session/user revocation remains fail-closed.
- Cloud now obtains a short-lived `typ=service` token from Auth and checks the
  account/session state using the verified `sub` and `sid` before the business
  handler runs.
- Account/session decisions implement the frozen catalog:
  `ACCOUNT_NOT_ACTIVE`, `SESSION_REVOKED` and
  `AUTH_AUTHORITY_UNAVAILABLE`.
- Service-token requests use bounded HTTP responses and timeouts, same-origin
  endpoints/redirects, refresh skew, concurrent-request singleflight and at
  most one refresh/retry after an upstream `401`.
- Cloud validates the Auth verification contract during JWT-mode startup. A
  JWKS URL, issuer, audience or signing-algorithm drift prevents unsafe startup.
- Environment examples now use the real Auth internal v1 paths; API
  documentation uses the frozen error codes.

## Automated verification

The following checks passed from a clean release database on 2026-08-04:

| Check | Result |
|---|---|
| `make test-release-process5` | Pass — 9/9 migration/schema/race/reconciliation/vet/build steps |
| `make test-migration-phase2` | Pass — empty DB, populated Phase 1 upgrade, rollback/reapply, invariants and atomic unsafe-backfill rejection |
| `make test-gate1-person4-static` | Pass — gateway, OpenAPI and environment contract |
| `make test-gate1-person4` | Pending — requires live JWKS and environment-issued token fixtures |
| `go test -race -count=10 ./internal/config ./internal/auth` | Pass — repeated config/auth concurrency and security tests |

New tests cover active/inactive accounts, revoked/missing sessions, malformed
authority responses, service-token cache and concurrent issuance, stale-token
refresh, split-origin rejection and Auth audience drift.

## External cutover evidence still required

The implementation and hermetic test suite are complete, but production
cutover must not be marked passed until the external Auth environment provides:

1. At least one usable `RS256` or `ES256` public key in the integration JWKS;
   production cutover separately requires the same property in production.
2. An active `hacom-cloud-service` service-client registration with the
   `chat-auth-service` audience and a secret supplied through deployment secret
   storage.
3. Auth-issued valid, expired, refresh, revoked, inactive-account and two-owner
   access-token fixtures for `make test-contract-phase2-auth`.

At the time of this report the public JWKS responded HTTP `200` with an empty
`keys` array, and no live token/service-client secrets were present locally.
The Cloud service intentionally fails closed in that state; demo mode is not a
production workaround.
