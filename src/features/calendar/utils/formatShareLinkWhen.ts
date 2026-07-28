/**
 * @fileoverview Gộp mốc thời gian của lịch họp thành 1 dòng đọc được cho màn
 * xem trước share-link — nơi chỉ có startAt/endAt/allDay chứ không có nguyên
 * CalendarEvent để dùng formatEventTimeRange (utils/timeline.ts).
 */

/** "Thứ Ba, 28/07/2026 · 16:30 — 18:00" (bỏ phần giờ nếu là lịch cả ngày). */
export const formatShareLinkWhen = (
  startIso: string,
  endIso: string,
  allDay: boolean,
): string => {
  const start = new Date(startIso);
  // ISO hỏng → trả rỗng để UI tự ẩn dòng, không in "Invalid Date" ra mặt người dùng.
  if (Number.isNaN(start.getTime())) return "";

  const day = start.toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  if (allDay) return `${day} · Cả ngày`;

  const hm = (d: Date) =>
    d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

  const end = new Date(endIso);
  return Number.isNaN(end.getTime())
    ? `${day} · ${hm(start)}`
    : `${day} · ${hm(start)} — ${hm(end)}`;
};
