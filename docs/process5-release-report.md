# Hacom Cloud — Gate 5 release report

> Ngày: 29/07/2026  
> Nhánh: `integration/process-5-release-demo`  
> Release source SHA: `bad6a91ff56ad2a7589da4786cd7dd6e003eef13`

## Phạm vi release

Backend Phase 1 gồm health, text, link, timeline, quota, upload trực tiếp MinIO,
Worker SHA-256 và cleanup upload hết hạn. Không gồm giao diện hoặc feature phase
sau.

## Evidence matrix

| Gate | Kết quả |
|---|---|
| Migration database rỗng `up` | Đạt, version 1 → 4 |
| Migration `down 1 → up 1` | Đạt, rollback/reapply version 4 |
| Schema verification | Đạt sau cả hai lần `up` |
| `go test -race -count=1 ./...` | Đạt toàn bộ package |
| PostgreSQL/MinIO integration | Đạt |
| 20 same-key initiate / 20 complete | Đạt, một reservation/commit/job |
| 24 reservation tại quota boundary | Đạt, 10 thành công/14 quota reject |
| 10 Worker claim một job | Đạt, đúng một Worker thắng |
| Quota/ledger reconciliation | Đạt, không orphan/duplicate active job |
| `go vet ./...` | Đạt |
| `go build ./...` | Đạt |
| Regression `scripts/test-integration.sh` | Đạt |
| Regression `scripts/test-process4-integration.sh` | Đạt |
| Postman JSON validation | Đạt |
| Postman acceptance | Đạt hai lượt liên tiếp, silent mode |
| Demo API + Worker + MinIO | Đạt 7/7 bước, dưới 10 phút |
| Shell syntax/demo safety | Đạt |

Release command:

```bash
make test-release-process5
```

Acceptance/demo:

```bash
make demo-process5
make test-postman-process5
```

## Finding

- BLOCKER: 0
- MAJOR: 0
- MINOR: 0

Lần Postman đầu tiên trong quá trình review đã phát hiện tên biến trùng sandbox
và CLI reporter in presigned URL. Collection đã đổi tên biến, Makefile bắt buộc
`--silent`, sau đó hai lượt acceptance liên tiếp đều đạt. Finding đã đóng trước
release source SHA nêu trên.

## Quyết định release

Gate 5: **PASSED**.

- Không tạo migration `000005`.
- Không thêm endpoint, UI hoặc feature ngoài Phase 1.
- Không merge vào `main` trong bước này.
- Nhánh đủ điều kiện tạo PR khi user yêu cầu.

Do user yêu cầu một người tự hoàn thành toàn bộ Quy trình 5, bốn phạm vi công
việc được dùng như bốn checklist review thay vì bốn tác giả commit khác nhau.
Mọi commit vẫn đi đúng nhánh chung đã chốt.
