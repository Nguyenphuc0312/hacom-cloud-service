import { useMemo } from "react";
import { useAuthStore } from "../../../stores/authStore";
import {
  getVisibleReportTags,
  type ReportTagCommand,
  type ReportTagProfileLike,
} from "./reportTags";

/**
 * Danh sách tag báo cáo cho user đang đăng nhập — dùng ở MỌI điểm gợi ý lệnh
 * (popup sau khi gõ `#`, quick command…). Đừng khai báo lại mảng tag ở component.
 *
 * Nguồn quyền là `authStore.user` — nó luôn là kết quả `/auth/me` mới nhất
 * (`initialize`/`refreshUser` THAY nguyên object user, không merge), nên quyền
 * bị thu hồi giữa phiên sẽ biến mất ở lần render kế tiếp. Chưa đăng nhập /
 * profile lỗi → `user === null` → chỉ 2 tag cá nhân (fail-closed).
 */
export function useVisibleReportTags(): readonly ReportTagCommand[] {
  // `User` của authStore không khai báo field báo cáo công việc; chúng tới từ
  // `/auth/me` qua spread nên chỉ tồn tại ở runtime — ép kiểu đúng một chỗ.
  const profile = useAuthStore(
    (s) => s.user as ReportTagProfileLike | null,
  );

  return useMemo(() => getVisibleReportTags(profile), [profile]);
}

export default useVisibleReportTags;
