/**
 * Lọc thông báo lịch trong chuông. Hai trục ĐỘC LẬP, giao nhau (AND):
 *  - thời gian: hôm nay / tuần này / tất cả
 *  - loại: mời họp / đã xác nhận / đã từ chối / đổi giờ / huỷ
 * Tách riêng khỏi component để test được mà không cần dựng DOM.
 */

export type HrNotificationTimeFilter = "all" | "today" | "week";
export type HrNotificationKindFilter =
  | "all"
  | "invited"
  | "accepted"
  | "declined"
  | "updated"
  | "cancelled";

/** Chỉ cần đúng phần dữ liệu dùng để lọc — không buộc cả HrAppNotification. */
export interface FilterableNotification {
  type: string;
  createdAt: string;
  payload?: Record<string, unknown> | null;
}

/** Đầu ngày theo giờ máy — mốc "hôm nay". */
const startOfToday = (now: Date): Date =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate());

/**
 * Đầu tuần theo THỨ HAI (chuẩn VN), không phải Chủ nhật như getDay() mặc định.
 * Dùng Chủ nhật làm mốc thì sáng thứ Hai sẽ mất sạch thông báo tuần này.
 */
const startOfWeek = (now: Date): Date => {
  const d = startOfToday(now);
  const dow = (d.getDay() + 6) % 7; // T2=0 … CN=6
  d.setDate(d.getDate() - dow);
  return d;
};

const matchesTime = (
  n: FilterableNotification,
  filter: HrNotificationTimeFilter,
  now: Date,
): boolean => {
  if (filter === "all") return true;
  const created = new Date(n.createdAt).getTime();
  if (Number.isNaN(created)) return true; // ngày hỏng → đừng giấu thông báo
  const from = filter === "today" ? startOfToday(now) : startOfWeek(now);
  return created >= from.getTime();
};

const matchesKind = (
  n: FilterableNotification,
  filter: HrNotificationKindFilter,
): boolean => {
  if (filter === "all") return true;
  if (filter === "invited") {
    return (
      n.type === "calendar.meeting.invited" ||
      n.type === "calendar.meeting.joined_via_share_link"
    );
  }
  // "updated" = đổi giờ/nội dung. "cancelled" gộp cả huỷ lịch lẫn gỡ mình khỏi
  // lịch — BE dùng chung một type cho hai việc này.
  if (filter === "updated") return n.type === "calendar.meeting.updated";
  if (filter === "cancelled") return n.type === "calendar.meeting.cancelled";
  // accepted / declined: chỉ có ở thông báo phản hồi, phân biệt bằng payload.
  if (n.type !== "calendar.meeting.participant_responded") return false;
  const response = n.payload?.["response"];
  return filter === "accepted"
    ? response === "ACCEPTED" || response === "MAYBE"
    : response === "DECLINED";
};

export const filterHrNotifications = <T extends FilterableNotification>(
  items: T[],
  time: HrNotificationTimeFilter,
  kind: HrNotificationKindFilter,
  now: Date = new Date(),
): T[] => items.filter((n) => matchesTime(n, time, now) && matchesKind(n, kind));
