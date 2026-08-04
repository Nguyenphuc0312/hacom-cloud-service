# Phase 3 admin quota review

## Trust and call chain

1. The browser calls only `chat-admin-service` with its admin access token.
2. Admin Service authenticates the browser principal, then calls Auth
   `/internal/v1/auth/me` on every list/approve/reject request. The refreshed
   profile must contain `cloud.quota.review`; browser JWT permissions are not
   the final authority.
3. Admin Service obtains an Auth-issued service token for audience
   `hacom-cloud-service` and scope `cloud.quota.review`.
4. Cloud verifies token type, signature, issuer, audience, expiry and scope.
   Only after verification does it trust `X-Admin-Actor-ID`.
5. Cloud owns the quota transaction and audit. Admin Service and Panel never
   access the Cloud database.

## Transaction and retry invariants

- Lock order is Drive, Quota, Quota Request.
- Only `pending -> approved|rejected` is allowed.
- Approval is rejected when `requested_quota_bytes < used_bytes + reserved_bytes`.
- Approval assigns `quota_bytes = requested_quota_bytes`; it never adds a delta.
- The review idempotency key is stored on the request. An exact retry returns
  `applied=false`, creates no second audit row and does not update quota again.
- A reused key with different decision/note returns `IDEMPOTENCY_CONFLICT`.
- Note text is stored for review but metrics/audit metadata record only
  `notePresent`, never the note itself.

## Service-client provisioning

Use the existing Auth Service provisioner with a secret of at least 32 bytes;
the command never prints the secret or its hash:

```text
SERVICE_CLIENT_ID=chat-admin-service
SERVICE_CLIENT_DISPLAY_NAME=Chat Admin Service
SERVICE_CLIENT_ALLOWED_SCOPES=cloud.quota.review
SERVICE_CLIENT_ALLOWED_AUDIENCES=hacom-cloud-service
SERVICE_CLIENT_SECRET=<rotated-secret>
npm run service-client:upsert -- --rotate-secret
```

Configure the same secret only in Admin Service as
`CLOUD_SERVICE_CLIENT_SECRET`. Do not expose it to Admin Panel.

## Audit evidence

```sql
SELECT occurred_at, actor_user_id, request_id, action, entity_id,
       metadata->>'decision' AS decision,
       (metadata->>'previousQuotaBytes')::bigint AS previous_quota_bytes,
       (metadata->>'resultingQuotaBytes')::bigint AS resulting_quota_bytes,
       metadata->>'operationId' AS operation_id
FROM cloud.audit_logs
WHERE entity_type = 'quota_request'
  AND action IN ('cloud.quota_request.approved', 'cloud.quota_request.rejected')
ORDER BY occurred_at DESC, id DESC;
```

Duplicate-evidence check (must return no rows):

```sql
SELECT metadata->>'operationId' AS operation_id, count(*)
FROM cloud.audit_logs
WHERE entity_type = 'quota_request'
  AND action IN ('cloud.quota_request.approved', 'cloud.quota_request.rejected')
GROUP BY metadata->>'operationId'
HAVING count(*) <> 1;
```

Quota safety reconciliation (must return no rows):

```sql
SELECT request.id, request.status, quota.quota_bytes,
       request.requested_quota_bytes, quota.used_bytes, quota.reserved_bytes
FROM cloud.quota_requests AS request
JOIN cloud.quotas AS quota ON quota.drive_id = request.drive_id
WHERE request.status = 'approved'
  AND (
    quota.quota_bytes < quota.used_bytes + quota.reserved_bytes
    OR request.requested_quota_bytes < quota.used_bytes + quota.reserved_bytes
  );
```

Rollback migration `000009` only after the Admin Service endpoints are disabled;
rolling it back removes review idempotency evidence but does not revert an
already approved quota value.
