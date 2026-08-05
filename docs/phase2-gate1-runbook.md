# Phase 2 Gate 1 runbook

## Ownership boundary

Gate 1 is evaluated in two explicit layers:

1. **Cloud/Web scope** — owned by this work: Cloud regression, migration,
   static production auth contract and authorized `chat-web-client` readiness.
2. **External backend/live scope** — owned by Hacom Holding DX teams: production
   token/JWKS cutover, revocation authority, gateway runtime and cross-service
   identity E2E.

The first layer can pass independently. The second remains `DEFERRED`; it must
never be treated as skipped/passed and must not be bypassed with HS256.

## Cloud/Web gate

Use a clean or reviewed frontend worktree containing the Cloud integration:

```bash
PHASE2_GATE1_WEB_CLIENT_DIR=/path/to/chat-web-client make test-gate1
```

The runner records both revisions and executes:

- Phase 1 Cloud release regression/race/vet/build;
- migration `000005` empty/up/down/backfill/fail-safe checks;
- Cloud Auth/OpenAPI/JWKS static contract tests;
- full Web typecheck, lint, production build, tests, performance benchmark and
  static production readiness gate.

No Auth, Infrastructure, Admin, Shared Types or Notification backend repository
is read, changed or built by this runner.

## External backend handoff

The Hacom Holding DX owners must provide the contracts and controlled fixtures
listed in `docs/HACOM-DX-BACKEND-CONTRACT-NEGOTIATION.md`, including:

- RS256/ES256 access tokens with stable `kid` and non-empty public JWKS;
- two active owners plus expired, refresh, revoked and inactive fixtures;
- account/revocation authority and Cloud service credential;
- `/cloud-api` edge routing/header stripping/CORS/rate-limit behavior.

Only after those owners provide an integration environment may the live test be
run with an untracked `0600` environment file. Never commit or print bearer,
refresh token, client secret, private key or presigned URL.

## Status rule

- `make test-gate1` green: mark **Cloud/Web Gate 1 PASS**.
- External fixtures unavailable: mark **external/live Gate 1 DEFERRED**.
- Full Phase 2 production identity is complete only when both layers have
  reviewable evidence.
