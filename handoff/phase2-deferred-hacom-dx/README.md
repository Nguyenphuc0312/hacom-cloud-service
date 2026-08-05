# Phase 2 deferred Hacom Holding DX handoff package

Gói này bảo toàn dependency backend đang tạm hoãn và patch frontend baseline.
Frontend hiện đã được phép triển khai; các patch được giữ như recovery archive,
không còn là hạng mục chờ cấp quyền.

## Nội dung

- `manifest.json`: danh sách dependency, owner và điều kiện mở lại.
- `RESUME-CHECKLIST.md`: checklist bắt buộc trước khi tiếp tục integration.
- `SHA256SUMS`: checksum của patch frontend.
- `chat-web-client-patches/`: 6 commit frontend dưới dạng `git format-patch`.

Patch series được xuất từ:

- repository: `chat-web-client`;
- base: `origin/integration/phase-2-process-1-baseline-auth` tại `8ccd36a2`;
- thứ tự commit: `7fbc9a7d`, `07abe230`, `ee3396f0`, `153758ec`,
  `7bd9d38a`, `211f072a`.

Không có `.env.local`, password, production bearer, refresh token, service
secret, private key hoặc presigned URL trong gói. Chuỗi `access-token` và
`fresh-token` trong patch test chỉ là fixture giả.

## Cách dùng khi cần phục hồi/rebase frontend

1. Đọc `docs/PHASE2-HACOM-DX-DEFERRED-SCOPE.md` và checklist trong thư mục này.
2. Fetch baseline frontend mới và review drift so với base ghi trên.
3. Kiểm tra checksum bằng `shasum -a 256 -c SHA256SUMS` từ thư mục gói.
4. Tạo nhánh recovery/integration trong đúng repository `chat-web-client`.
5. Dùng `git am` theo thứ tự patch, xử lý conflict bằng review và chạy lại
   `npm run ci:readiness`.

Không áp dụng patch trực tiếp vào `main`, không copy code frontend vào Cloud
backend, và không dùng gói này làm bằng chứng rằng live Gate đã pass.
