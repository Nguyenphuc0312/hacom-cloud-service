/**
 * calendarFetchRange — khoảng thời gian FE hỏi hr-api cho một màn lịch.
 *
 * Nguồn DUY NHẤT cho cả CalendarPage (lưới tháng) và WeeklyCalendarWidget (lưới
 * tuần) để hai chỗ không lệch nhau.
 *
 * ## Vì sao chỉ cần đệm 1 tuần, không lùi 6 tháng
 *
 * Trước đây cả hai màn lùi `from` về 6 THÁNG trước, với lý do ghi trong comment:
 * "backend lọc theo startAt nên range hẹp sẽ không trả event dài". Lý do đó SAI —
 * hr-api lọc overlap chuẩn hai đầu (calendar.service.ts, buildWhereClause):
 *
 *     startAt < to   AND   endAt >= from
 *
 * nên một event bắt đầu từ tháng 1 kéo sang tháng 7 VẪN được trả khi hỏi đúng
 * tháng 7. BE có test khoá hành vi này ("uses interval overlap rather than event
 * start time only").
 *
 * Cái giá của việc lùi 6 tháng: mỗi lần đổi tháng phải tải ~8 tháng dữ liệu.
 * hr-api phân trang (trần 100/trang), nên càng nhiều lịch càng nhiều request, và
 * khi vượt trần gom trang thì event bị bỏ ÂM THẦM — đúng loại lỗi khó truy nhất.
 *
 * ## Vì sao đệm đúng 14 ngày
 *
 * Lưới tháng luôn vẽ 42 ô (6 tuần) nên hiển thị cả ngày của tháng liền kề. Quét
 * mọi tháng 2024–2036: lệch tối đa 6 ngày TRƯỚC đầu tháng và 14 ngày SAU cuối
 * tháng (tháng 28 ngày bắt đầu Chủ nhật). Lấy 14 cho cả hai đầu để không bao giờ
 * hụt — đệm thiếu thì ô ngoài rìa lưới trống một cách khó hiểu.
 */

const PAD_DAYS = 14;

const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export interface CalendarFetchRange {
  from: string;
  to: string;
}

/**
 * Khoảng fetch bao phủ [first..last] cộng đệm 1 tuần mỗi đầu.
 * Trả chuỗi `YYYY-MM-DD` (giờ địa phương) — hr-api nhận dạng ngày.
 */
export const buildFetchRange = (first: Date, last: Date): CalendarFetchRange => {
  const from = new Date(first.getFullYear(), first.getMonth(), first.getDate() - PAD_DAYS);
  const to = new Date(last.getFullYear(), last.getMonth(), last.getDate() + PAD_DAYS);
  return { from: formatDate(from), to: formatDate(to) };
};

/** Khoảng fetch cho lưới THÁNG đang xem (month: 0-11). */
export const getMonthFetchRange = (year: number, month: number): CalendarFetchRange =>
  buildFetchRange(new Date(year, month, 1), new Date(year, month + 1, 0));

/** Khoảng fetch cho lưới TUẦN đang xem (7 ngày đã dựng sẵn). */
export const getWeekFetchRange = (weekDays: Date[]): CalendarFetchRange | null => {
  if (weekDays.length === 0) return null;
  return buildFetchRange(weekDays[0], weekDays[weekDays.length - 1]);
};
