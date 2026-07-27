/**
 * @fileoverview Lưu TẠM lý do "Không tham gia" ở localStorage (chỉ máy hiện tại).
 *
 * BE (`hrCalendarApi.updateMyResponse`) chỉ nhận `{ response }`, không có field
 * `reason` — xem contract đề xuất
 * `chat-api-service/docs/requests/FE__calendar-decline-reason__contract__27-07-26.md`.
 * Trước khi BE ship field thật, lý do chỉ hiện lại trên máy người đã từ chối,
 * KHÔNG đồng bộ cho người tạo lịch xem trên máy khác.
 *
 * ponytail: localStorage phẳng theo key `eventId:authUserId`, không TTL/dọn rác —
 * nâng cấp lên lưu server ngay khi BE có field reason thật (xoá luôn module này).
 */

const KEY_PREFIX = "hacom-calendar-decline-reason";

const buildKey = (eventId: string, authUserId: string): string =>
  `${KEY_PREFIX}:${eventId}:${authUserId}`;

export const saveDeclineReason = (
  eventId: string,
  authUserId: string,
  reason: string,
): void => {
  try {
    localStorage.setItem(buildKey(eventId, authUserId), reason);
  } catch {
    // localStorage có thể đầy/bị chặn (private mode) — lý do là tiện ích phụ,
    // không đáng để phá luồng phản hồi chính nếu lưu thất bại.
  }
};

export const getDeclineReason = (
  eventId: string,
  authUserId: string,
): string | null => {
  try {
    return localStorage.getItem(buildKey(eventId, authUserId));
  } catch {
    return null;
  }
};

/** Xoá lý do đã lưu — gọi khi người dùng đổi ý sang "Tham gia". */
export const clearDeclineReason = (eventId: string, authUserId: string): void => {
  try {
    localStorage.removeItem(buildKey(eventId, authUserId));
  } catch {
    // như trên — bỏ qua lỗi storage.
  }
};
