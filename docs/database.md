# Quy ước database

Database dự kiến là PostgreSQL. Các bảng và quan hệ phải được xác nhận qua ERD trước khi viết migration chính thức.

Nguyên tắc:

- PostgreSQL chỉ lưu metadata và trạng thái; không lưu bytes của file.
- Dung lượng đã dùng phải có cơ chế reserve/commit/release để tránh upload đồng thời vượt quota.
- Xóa mềm và thời gian lưu trong thùng rác cần được xác nhận trước khi triển khai.
- Mọi thay đổi quota quan trọng cần có ledger hoặc audit log để đối soát.
