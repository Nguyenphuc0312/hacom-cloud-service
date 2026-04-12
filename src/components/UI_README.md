# UI Guidelines for Admin Panel

## Card usage

- Dùng `Card` cho vùng thông tin tổng quan, widget, hoặc group nội dung rời.
- Không lồng Card trong Card.
- Tránh dùng Card cho từng field nhỏ, chỉ dùng cho section lớn.

## Modal vs Drawer

- Modal (`AppModal`): dùng cho confirm, form ngắn, hoặc thao tác cần user tập trung.
- Drawer (`AppDrawer`): dùng cho form dài, detail panel, hoặc thao tác không blocking.
- Không mở lồng nhiều modal/drawer.

## Page Header pattern

- Luôn dùng `PageHeader` ở đầu mỗi trang chính.
- Title rõ, có thể có description, action, meta.
- Toolbar/filter nằm dưới header.

## Table pattern

- Dùng `DataTableShell`, `DataTableToolbar`, `TableEmptyState`, `TableLoadingState`, `TablePagination`.
- Row actions dùng `RowActionsDropdown`.
- Trạng thái loading/empty/error phải rõ ràng.

## Button hierarchy

- Primary: hành động chính, nổi bật nhất.
- Secondary: hành động phụ, ít nổi bật hơn.
- Danger: hành động phá huỷ, màu đỏ.
- Ghost: hành động phụ, không nổi bật, thường dùng cho cancel/close.

## Khác

- Ưu tiên dùng component trong `src/components/ui/` cho các primitive.
- Không lặp lại className/style, dùng utility hoặc extend.
- Responsive: kiểm tra layout ở >=2 breakpoint.
- Chuẩn bị sẵn dark mode (dùng token màu, không hard-code color).
