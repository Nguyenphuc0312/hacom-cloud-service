# Quy trình 5 — Slide outline

1. Bài toán: Personal Cloud timeline cho text, link và file trong demo Phase 1.
2. Phạm vi: backend Go; PostgreSQL; MinIO; không UI/Auth/Chat/Folder.
3. Kiến trúc: Client → API metadata → PostgreSQL/ledger; Client → MinIO; Worker.
4. Data model: Drive, Item, Object, Upload Session, Quota, Ledger, Job.
5. Quota: reserve → commit/release; snapshot luôn bằng tổng ledger.
6. Upload: idempotency, URL 15 phút, signed headers, complete verification.
7. Worker: `SKIP LOCKED`, hash SHA-256, cleanup, retry/backoff/dead.
8. Failure recovery: stale lease, lost lease, object mất, transaction rollback.
9. Security: ownership 404, strict JSON, safe errors, không log URL/secret.
10. Gate 5: migration up/down/up, 20-way concurrency, race, vet, build, Postman.
11. Demo live: text/link → upload → processing → ready → ownership/quota.
12. Kết luận và giới hạn phase sau: Auth thật, UI, folder/share/preview/scan.
