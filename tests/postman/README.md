# Postman release suites

The collections are contract fixtures, not a substitute for the Go integration
suite. Run them against a disposable owner/database and in this order:

1. Phase 2 auth baseline
2. Phase 2 Trash lifecycle
3. Phase 3 search/quota/admin review
4. Process 5 release smoke

Use `Hacom-Cloud-Local.postman_environment.json`. Keep Newman silent so signed
MinIO URLs, bearer tokens and object metadata are never printed. On Windows,
run the Process 5 collection in Docker with `baseUrl` overridden to
`http://host.docker.internal:8080`; this keeps the signed MinIO hostname reachable
from the same network namespace as the API.
