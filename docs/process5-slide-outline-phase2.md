# Process 5 — slide outline

1. **Outcome** — A reproducible Phase 2 Cloud release candidate with a 14-minute demo.
2. **Scope** — Gates 1–3 Cloud, Process 4 worker, My Documents frontend; explicit
   external Auth/Admin/notification handoffs.
3. **Architecture** — Browser → same-origin Cloud proxy → Cloud API; PostgreSQL,
   MinIO and Worker remain independently observable.
4. **Lifecycle** — active → Trash (24h) → restore or permanent delete; binary
   deletion is retried asynchronously.
5. **Quota invariant** — active + Trash + reserved values reconcile with the
   append-only ledger after every failure point.
6. **Search** — owner/drive scope first, indexed filters, stable cursor fingerprint.
7. **Quota request** — one pending request, integer bytes, transactional outbox,
   admin service-token review and idempotent approval/rejection.
8. **Frontend** — My Documents panel, quota breakdown, image/video/file/link
   resource tabs and chat-style voice messages.
9. **Worker recovery** — retry/backoff, stale lease recovery, missing-object success
   audit and crash-safe finalization.
10. **Evidence** — backend race suite, frontend readiness, browser E2E, Postman and
    migration rollback/reapply.
11. **Demo flow** — readiness → text/link → upload/audio → Trash/restore/delete →
    search/quota request → evidence.
12. **Decision and next gate** — local Gate 5 PASS; production Auth/Admin/gateway
    integration remains the documented handoff.
