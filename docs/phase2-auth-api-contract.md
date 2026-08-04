# Phase 2 Process 1 — Auth, API and gateway contract

Status: frozen for Process 1. Owner: the four-person Process 1 team. This document
records the Person 4 contract boundary; `chat-auth-service` remains the identity,
session and account-state source of truth.

## Public and upstream routes

- Browser/public base: `/cloud-api` on the Chat origin.
- Browser Cloud API base: `/cloud-api/api/v1/cloud`.
- Gateway strips only the leading `/cloud-api` and proxies to `hacom-cloud-api:8080`.
- Cloud upstream base remains `/api/v1/cloud`; Phase 1 endpoint names do not change.
- `/health/live` and `/health/ready` are public operational endpoints. Business
  endpoints require a Hacom access token.
- The reference Nginx contract is
  `deployments/nginx/cloud-api.conf.example`. The infrastructure owner must adapt
  the upstream alias without weakening its security rules.

## User access-token verification

The canonical source is `chat-auth-service/contracts/jwt-auth-contract.md` and
`GET /internal/auth/verification-contract`. Cloud must:

1. Require `Authorization: Bearer <token>` on every business route.
2. Verify the signature; decode-only is forbidden.
3. Pin `RS256` or `ES256`, select the public key by `kid` from
   `AUTH_JWKS_URL`, and never receive an Auth private key.
4. Verify configured `iss`, `aud`, expiry and `typ=access`. The compatibility
   claim `type=access` may be accepted only during the Auth migration window.
5. Require `sub`, `sid`, `jti`, `iat` and `exp`. `userId` is only a temporary
   alias; ownership always uses `sub`.
6. Check auth-owned account/session state using `sub` and `sid`. Protected
   writes fail closed when this authority is unavailable.
7. Reject refresh, service and admin tokens on user routes.

`AUTH_MODE=demo` is valid only when `APP_ENV` is `local` or `test`. JWT mode
ignores and the public gateway clears `X-Demo-User-ID`. Owner identifiers from
headers, query parameters or request bodies never override `sub`.

## Stable auth error catalog

| HTTP | Code | Contract |
|---:|---|---|
| 401 | `AUTH_REQUIRED` | Bearer credentials are absent or the scheme is malformed |
| 401 | `INVALID_ACCESS_TOKEN` | Signature/algorithm/key/issuer/audience/type/claims/expiry validation failed |
| 401 | `SESSION_REVOKED` | Auth authority reports a missing, expired or revoked session |
| 403 | `ACCOUNT_NOT_ACTIVE` | User is locked, disabled, deactivated, tombstoned or pending verification |
| 503 | `AUTH_AUTHORITY_UNAVAILABLE` | Required account/session authority is unavailable; write is not executed |

Cryptographic validation failures deliberately share one external code to avoid
turning the API into a token oracle. Responses use the existing envelope
`{"error":{"code":"...","message":"..."}}`, include `X-Request-ID`, do not
echo tokens or claims, and use `WWW-Authenticate: Bearer` on `401` responses.

## Gateway and browser security

- Browser traffic is same-origin through `/cloud-api`; wildcard or reflected
  credentialed CORS is forbidden. Direct cross-origin API calls receive no CORS
  grant unless an explicit reviewed allowlist is introduced.
- The edge applies a bounded per-client rate limit and returns `429` when the
  budget is exhausted. Rate limiting is defense in depth, not authorization.
- The edge creates `X-Request-ID`; Cloud returns it for correlation. Request IDs,
  `X-Forwarded-*` and client-IP headers are never identity inputs.
- The edge forwards `Authorization`, clears `X-Demo-User-ID`, and does not log
  bearer tokens, cookies, presigned URLs or request bodies.
- Cross-owner and missing Item/session responses remain indistinguishable `404`.

## Revocation and service dependency

| Component | Owns | Process 1 dependency |
|---|---|---|
| `chat-auth-service` | Token issuance, JWKS, session/account state, revocation | JWKS plus internal verification/account-state contracts |
| `hacom-cloud-service` | Cloud authorization boundary and owner-scoped data | Verifies token, uses `sub`, fails closed on protected writes |
| `chat-web-client` | Session transport and Cloud UI | Sends the existing Hacom access token; never invents owner truth |
| Gateway/infra | `/cloud-api`, trusted headers and throttling | Strips prefix, clears demo identity, forwards bearer token |
| Admin Service | Future service-token caller | User tokens are not accepted on service-only routes |

Cloud must not query the Auth database. Internal Auth calls use a short-lived
`typ=service` token issued to the `hacom-cloud-service` service client; shared
secret headers are transition-only and are not the Phase 2 target contract.

## Acceptance evidence

Static contract checks run with `make test-gate1-person4`. Live verification uses
tokens issued by the Auth integration environment/test signing key:

```bash
PHASE2_BASE_URL=http://localhost:8080 \
PHASE2_ACCESS_TOKEN_USER_A='<redacted>' \
PHASE2_ACCESS_TOKEN_USER_B='<redacted>' \
PHASE2_EXPIRED_TOKEN='<redacted>' \
PHASE2_REFRESH_TOKEN='<redacted>' \
PHASE2_REVOKED_TOKEN='<redacted>' \
make test-contract-phase2-auth
```

Tokens are environment-only. The runner never prints them and no private test
key is committed.
