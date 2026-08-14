/**
 * @fileoverview Gộp mốc thời gian của lịch họp thành 1 dòng đọc được cho màn
 * xem trước share-link — nơi chỉ có startAt/endAt/allDay chứ không có nguyên
 * CalendarEvent để dùng formatEventTimeRange (utils/timeline.ts).
 */

import { resolveEventTimeZone } from "./eventTimeZone";

/**
 * "Thứ Ba, 28/07/2026 · 16:30 — 18:00" (bỏ phần giờ nếu là lịch cả ngày).
 *
 * Ngày luôn hiển thị **dd/mm/yyyy** và giờ theo 24h.
 *
 * `timeZone` là múi giờ CỦA SỰ KIỆN (`HRCalendarEvent.timezone`). Trước đây hàm
 * này format theo múi giờ MÁY, nên cùng một cuộc họp mở ở nước ngoài lại hiện
 * giờ khác — và lệch cả ngày khi vắt qua nửa đêm. Không truyền thì rơi về múi
 * giờ nghiệp vụ mặc định (Asia/Ho_Chi_Minh), không phải giờ máy.
 */
export const formatShareLinkWhen = (
  startIso: string,
  endIso: string,
  allDay: boolean,
  timeZone?: string | null,
): string => {
  const start = new Date(startIso);
  // ISO hỏng → trả rỗng để UI tự ẩn dòng, không in "Invalid Date" ra mặt người dùng.
  if (Number.isNaN(start.getTime())) return "";

  const zone = resolveEventTimeZone(timeZone);

  // vi-VN + timeZone tường minh: "Thứ Ba, 28/07/2026" (dd/mm/yyyy).
  const day = start.toLocaleDateString("vi-VN", {
    timeZone: zone,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  if (allDay) return `${day} · Cả ngày`;

  const hm = (d: Date) =>
    d.toLocaleTimeString("vi-VN", {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });

  const end = new Date(endIso);
  return Number.isNaN(end.getTime())
    ? `${day} · ${hm(start)}`
    : `${day} · ${hm(start)} — ${hm(end)}`;
};
