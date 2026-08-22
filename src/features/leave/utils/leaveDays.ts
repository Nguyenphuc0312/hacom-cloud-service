export type LeaveDayPortion = "FULL" | "AM" | "PM";

const parseDateOnly = (value: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
};

const inclusiveDayCount = (start: Date, end: Date): number =>
  Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;

/**
 * Đếm số ngày THEO LỊCH của khoảng nghỉ — KHÔNG phải số ngày công.
 *
 * ⚠️ Đây KHÔNG phải con số quyết định. Server (`LeaveDurationService.derive`)
 * mới là nguồn sự thật: nó duyệt từng ngày theo ca đã phân của nhân viên và
 * BỎ QUA ngày không làm việc (cuối tuần, ngày lễ, ngày ca nghỉ). Hàm này đếm
 * cả những ngày đó vì FE không biết lịch làm việc của từng người.
 *
 * ⇒ Chỉ dùng cho: bật/tắt nút gửi khi khoảng ngày vô lý (<= 0), và ước lượng
 * hiển thị có ghi rõ là tạm tính. TUYỆT ĐỐI không gửi kết quả này lên server
 * như thể là số ngày nghỉ thật — server sẽ trả `LEAVE_TOTAL_DAYS_MISMATCH`.
 */
export const countCalendarLeaveDays = (
  startDate: string,
  endDate: string,
  startPortion: LeaveDayPortion,
  endPortion: LeaveDayPortion,
): number => {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  if (!start || !end || end < start) return 0;

  const days = inclusiveDayCount(start, end);
  if (days === 1) {
    if (startPortion === "FULL" && endPortion === "FULL") return 1;
    if (startPortion === "AM" && endPortion === "PM") return 1;
    return 0.5;
  }

  let total = days;
  if (startPortion !== "FULL") total -= 0.5;
  if (endPortion !== "FULL") total -= 0.5;
  return Math.max(total, 0.5);
};
