# Phase 3 observability dashboard

Cloud API exposes Prometheus text format at `GET /metrics`. All labels are fixed
enums; user IDs, item IDs, request IDs, reasons and file metadata are never labels.

## Dashboard queries

```promql
histogram_quantile(0.95, sum by (le, surface) (rate(hacom_cloud_search_latency_seconds_bucket{outcome="success"}[5m])))
```

```promql
sum by (action, outcome) (rate(hacom_cloud_quota_request_total[5m]))
```

```promql
sum by (decision, outcome) (rate(hacom_cloud_admin_review_total[5m]))
```

Alerts:

- search p95 exceeds the proposed 250 ms operational warning threshold for 10 minutes;
- any sustained `outcome="error"` or `outcome="rejected"` increase;
- review `applied` increases without matching `cloud.quota_request.approved` or
  `cloud.quota_request.rejected` audit evidence.

Audit correlation uses `cloud.audit_logs.request_id`, not a metric label. Admin
Service forwards the verified inbound `X-Request-ID`; Cloud writes that value in
the same database transaction as the quota decision.
