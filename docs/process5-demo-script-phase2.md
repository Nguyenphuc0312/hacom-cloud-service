# Process 5 — Phase 2 demo script (under 15 minutes)

## 0:00–1:00 — State the boundary

“This release candidate combines Cloud Phase 2 Gates 1–3 with the Process 4
worker and the My Documents frontend. The demo uses local demo identity only;
production Auth/Admin handoffs are not simulated.”

Show the two tested SHAs from `process5-release-report-phase2.md`.

## 1:00–2:00 — Readiness

```powershell
Invoke-WebRequest http://localhost:5100/chat/my-documents
Invoke-WebRequest http://localhost:8080/health/ready
Invoke-WebRequest http://localhost:9001
```

Show HTTP 200 and the PostgreSQL/MinIO readiness result. Do not display secrets.

## 2:00–4:00 — Active content

1. Open My Documents.
2. Create a text item and a web link.
3. Open the information panel and show Active/Trash counts and quota breakdown.
4. Open the Link tab to show URLs only; open File and Ảnh/Video previews.

## 4:00–7:00 — Upload and voice/media path

1. Upload one image and one ordinary file.
2. Show the image inline preview and download control after the item is ready.
3. Record and send a voice message; show that it renders as audio and is not
   counted in the File category.

## 7:00–9:00 — Trash lifecycle

1. Move the text item to Trash and show the 24-hour `purgeAfter` countdown.
2. Restore it and show that active/trash quota values reconcile.
3. Delete a binary item immediately and show the explicit `delete_pending` state.
4. Open Trash and verify the owner-only view.

## 9:00–11:00 — Search and quota request

1. Search active and Trash items with a type/date filter.
2. Load the next cursor page and change a filter to demonstrate cursor binding.
3. Create one quota request and show the pending status.
4. Explain that Admin approval is a service-token boundary, not a client quota write.

## 11:00–13:00 — Worker/recovery evidence

Show the acceptance matrix rows for hash, purge, retry, stale lease and
reconciliation. Do not manually edit job state or quota rows.

## 13:00–14:00 — Close

Run or show the recorded outputs of `npm run test:e2e`, `npm run test:e2e:perf`,
the backend race suite and Docker Newman. Leave one minute for questions.

## Fallback

If MinIO or the browser is unavailable, show the saved acceptance matrix and
release report. Never paste a presigned URL, access key, secret, object key or
request reason into the recording.
