# Checklist mở lại integration Hacom Holding DX

## Quyền và baseline

- [ ] Có xác nhận service/repository được phép thay đổi.
- [ ] Owner của Auth/Infra/Admin/Notification đã được chỉ định.
- [ ] Baseline mới đã fetch và ghi SHA; patch drift đã review.

## Auth authority

- [ ] Access token dùng RS256 hoặc ES256 và có `kid` ổn định.
- [ ] JWKS trả ít nhất một public key hợp lệ, không chứa private parameter.
- [ ] Issuer/audience/typ/claims khớp contract Cloud.
- [ ] Có service client cho `hacom-cloud-service` qua secret storage.
- [ ] Có hai user integration và token expired/refresh/revoked/inactive.

## Gateway và frontend

- [ ] `/cloud-api` forward bearer, tự sinh request ID và bỏ owner demo header.
- [ ] CORS, rate limit, timeout và body limit đã smoke test.
- [x] Frontend đã được mở quyền, patch baseline được review và readiness pass.
- [ ] Demo mode chỉ bật ở local/test; production không gửi `X-Demo-User-ID`.

## Admin/notification

- [ ] Permission `cloud.quota.review` được governance phê duyệt.
- [ ] Admin Service dùng service token, không truy cập DB Cloud trực tiếp.
- [ ] Notification/outbox contract có retry, idempotency và ownership rõ ràng.

## Acceptance

- [ ] User A/B ownership đối xứng và spoof header bị chặn.
- [ ] Token sai/hết hạn/revoked/inactive bị từ chối fail-closed.
- [ ] Full migration, Cloud, Auth, Shared Types, Web, Infra và E2E đều pass.
- [ ] Gate report ghi SHA và không chứa token/secret/presigned URL.
