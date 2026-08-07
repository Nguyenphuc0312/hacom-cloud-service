# Process 5 — API, OpenAPI and Postman index

## Authoritative contracts

- Core API behavior and error catalog: [`api.md`](api.md)
- Auth/JWKS boundary: [`openapi/phase2-cloud-auth.openapi.yaml`](openapi/phase2-cloud-auth.openapi.yaml)
- Admin quota service-token boundary: [`openapi/phase3-admin-quota.openapi.yaml`](openapi/phase3-admin-quota.openapi.yaml)
- Search and quota design: [`database/phase3-search-design.md`](database/phase3-search-design.md) and
  [`database/phase3-quota-request-design.md`](database/phase3-quota-request-design.md)

The release contract preserves owner-scoped `404`, strict JSON/method/content type,
opaque filter-bound cursors, integer byte values, idempotency keys and safe error
responses. No response exposes a bucket, object key, purge job internals or signed
URL in an error/log.

## Postman suites

Run the suites in this order on a clean local/staging owner:

1. `Hacom-Cloud-Phase-2-Process-1-Auth.postman_collection.json`
2. `Hacom-Cloud-Phase-2-Trash.postman_collection.json`
3. `Hacom-Cloud-Phase-3-Gate-3.postman_collection.json`
4. `Hacom-Cloud-Process-5-Release.postman_collection.json`

Use `Hacom-Cloud-Local.postman_environment.json` and keep Newman in silent mode.
The release collection uses a fresh demo owner UUID and performs readiness,
text/link, upload, direct MinIO PUT, Worker completion, ownership and quota checks.
For Windows Docker DNS, run Newman in a container with:

```bash
docker run --rm --add-host host.docker.internal:host-gateway \
  -v "$PWD:/work" -w /work node:20-alpine sh -lc \
  'npx --yes newman run tests/postman/Hacom-Cloud-Process-5-Release.postman_collection.json \
   -e tests/postman/Hacom-Cloud-Local.postman_environment.json \
   --env-var baseUrl=http://host.docker.internal:8080 --reporters cli --silent'
```

Do not use verbose CLI reporters for collections that contain presigned PUT/GET
URLs. Attach only assertion counts and safe failure messages to the release report.
