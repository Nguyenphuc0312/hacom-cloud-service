SELECT request.id, request.status, 'terminal audit count mismatch' AS finding
FROM cloud.quota_requests AS request
LEFT JOIN cloud.audit_logs AS audit
  ON audit.entity_id=request.id
 AND audit.action='cloud.quota_request.' || request.status::text
WHERE request.status IN ('approved','rejected')
GROUP BY request.id, request.status
HAVING COUNT(audit.id) <> 1;

SELECT request.id, request.status, 'review operation missing' AS finding
FROM cloud.quota_requests AS request
WHERE request.status IN ('approved','rejected')
  AND (request.review_operation_id IS NULL OR request.reviewed_by_user_id IS NULL OR request.reviewed_at IS NULL);

SELECT request.id, request.status, 'audit actor or trace missing' AS finding
FROM cloud.quota_requests AS request
JOIN cloud.audit_logs AS audit
  ON audit.entity_id=request.id
 AND audit.action='cloud.quota_request.' || request.status::text
WHERE request.status IN ('approved','rejected')
  AND (audit.actor_type <> 'admin' OR audit.actor_user_id IS NULL OR audit.request_id IS NULL);
