import { formatCalendarDate, formatCalendarDateTime } from "../../../utils/formatTime";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Hiển thị ngày của nghiệp vụ Công & Phép theo chuẩn HRM `dd/MM/yyyy`.
 *
 * API vẫn gửi / nhận ISO. Ngày không kèm giờ được tách chuỗi để không lệch
 * ngày theo timezone; timestamp có giờ vẫn được format theo múi giờ trình duyệt.
 */
export function formatWorkDate(value?: string | null): string {
  if (!value) return "-";

  const match = ISO_DATE.exec(value);
  if (match) {
    const [, year, month, day] = match;
    const parsed = new Date(`${value}T00:00:00`);
    const isValid =
      !Number.isNaN(parsed.getTime()) &&
      parsed.getFullYear() === Number(year) &&
      parsed.getMonth() + 1 === Number(month) &&
      parsed.getDate() === Number(day);

    return isValid ? `${day}/${month}/${year}` : "-";
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "-" : formatCalendarDate(parsed);
}

/** Hiển thị timestamp Công & Phép theo chuẩn HRM `dd/MM/yyyy HH:mm`. */
export function formatWorkDateTime(value?: string | null): string {
  if (!value) return "-";
  if (ISO_DATE.test(value)) return formatWorkDate(value);

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "-" : formatCalendarDateTime(parsed);
}
