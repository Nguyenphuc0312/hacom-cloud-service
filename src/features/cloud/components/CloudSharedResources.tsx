import React from "react";

/**
 * Kho lưu trữ (Ảnh/Video · File · Link) của Cloud dùng ĐÚNG component của panel thông
 * tin nhóm, để hai màn cùng một vốn từ và thao tác trong kho (chuyển tiếp, tải, xem
 * tất cả) giống hệt bên ngoài.
 *
 * Tách riêng khỏi HacomCloudInfoSidebar vì file đó còn export hàm thuần
 * (`truncateFileNamePreservingExtension`); trộn `React.lazy` vào đó làm hỏng fast refresh.
 */
export const CloudSharedResources = React.lazy(() =>
  import("../../../components/info/shared-resources/SharedResourcesPreview").then((m) => ({
    default: m.SharedResourcesPreview,
  })),
);

export default CloudSharedResources;
