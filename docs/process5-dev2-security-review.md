# Process 5 — Dev 2 Auth/API security review

> Review scope: `hacom-cloud-service` backend
> Review date: 2026-08-07
> Reviewer role: Dev 2 — Auth/API security review

## Result

The API validation and data-isolation checks pass. The Cloud API now has a
production JWT/JWKS middleware, revocation fail-closed hook, service/admin token
verification helpers, rate limiting and local-only demo mode. The release gate
still depends on the deployed `chat-auth-service` JWKS and revocation endpoint
being configured and exercised in an environment test.

## Checks that passed

The existing suite passed with `go test -count=1 ./internal/cloudapi`:

- missing or invalid demo identity is rejected with `401`;
- unknown JSON fields, trailing JSON and oversized bodies are rejected;
- unsupported media types and HTTP methods are rejected;
- cross-owner item reads are hidden as `404`;
- request IDs are returned and included in internal-error context;
- internal dependency errors use a safe response and do not serialize the
  underlying error;
- presigned URL generation is covered by upload integration tests and is not
  emitted by generic error handling.

The security suite includes signed JWT, wrong-claim, revoked-token, service
scope, admin permission, demo-mode guard and rate-limit tests.

## Release blockers

| Requirement | Current state | Severity |
| --- | --- | --- |
| `Authorization: Bearer <access-token>` | Implemented in `internal/auth` and wired into API startup | PASS |
| JWT signature, `alg`, `kid`, issuer, audience, expiry and `typ` validation | RS256/ES256; optional legacy HS256 is explicitly gated | PASS |
| JWKS cache and key rotation | TTL cache and refresh on unknown `kid` | PASS |
| Session/account revocation and fail-closed writes | HTTP revocation checker; unavailable authority returns `503` | PASS, environment integration pending |
| Owner from verified `sub`, with no client spoofing | Cloud principal owner comes from verified claims | PASS |
| Internal service token and Admin permission | `typ=service` scope and admin permission helpers implemented | PASS for helper contract; route integration pending |
| Rate limiting | Bounded in-memory IP window with `429 RATE_LIMITED` | PASS for single instance |
| Secret/presigned URL leakage | Existing safe-error tests pass; keep regression coverage | PASS |

## Error catalog for the pending auth contract

| Condition | Required HTTP result |
| --- | --- |
| Missing/malformed Bearer token | `401 AUTH_REQUIRED` |
| Invalid signature, issuer, audience, type or expiry | `401 AUTH_INVALID` |
| Revoked session/account | `401 AUTH_REVOKED` |
| Auth/revocation dependency unavailable on a write | `503 AUTH_UNAVAILABLE` or fail-closed equivalent |
| Verified user does not own the resource | `404 NOT_FOUND` |
| Invalid service token | `401 SERVICE_AUTH_INVALID` |
| Service token lacks permission | `403 FORBIDDEN` |
| Rate limit exceeded | `429 RATE_LIMITED` |

The codes are now emitted by the auth middleware where applicable. The
revocation response shape and service-token issuance must still be verified
against the deployed Auth service before production rollout.

## Required follow-up before Gate 5

1. Configure `AUTH_MODE=jwt`, `AUTH_JWKS_URL`, `JWT_ISSUER`, `JWT_AUDIENCE` and
   `AUTH_REVOCATION_URL` from the deployed Auth service.
2. Keep local demo mode only when `AUTH_MODE=demo` and `APP_ENV` is local or
   test; production must reject `X-Demo-User-ID`.
3. Add an environment integration test for live JWKS rotation, revoked session
   and unavailable revocation authority.
4. Connect the Admin quota route to `RequirePermission("cloud.quota.review")`.
5. Re-run the security suite and update the Postman collection to use access
   tokens instead of demo headers for production acceptance.
