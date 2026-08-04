/**
 * Vietnamese date/time formatting for the reminder card + detail modal.
 * Kept local (like PollMessage's inline formatting) so the components stay
 * self-contained. Matches Zalo's copy: "Hôm nay lúc 14:32",
 * "Thứ Năm, 02 Tháng 07 lúc 14:32", and the date-badge "THỨ NĂM / 02 / THÁNG 7".
 */

export type RepeatType = "none" | "daily" | "weekly" | "monthly";

const WEEKDAY_SHORT = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const WEEKDAY_FULL = [
  "Chủ Nhật",
  "Thứ Hai",
  "Thứ Ba",
  "Thứ Tư",
  "Thứ Năm",
  "Thứ Sáu",
  "Thứ Bảy",
];
// Badge weekday label (Zalo uses "THỨ NĂM" etc. uppercased)
const WEEKDAY_BADGE = [
  "CHỦ NHẬT",
  "THỨ HAI",
  "THỨ BA",
  "THỨ TƯ",
  "THỨ NĂM",
  "THỨ SÁU",
  "THỨ BẢY",
];

const pad = (n: number) => String(n).padStart(2, "0");

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const parse = (iso: string): Date => new Date(iso);

/** "THỨ NĂM" / "02" / "THÁNG 7" for the card's calendar badge. */
export function reminderDateBadge(iso: string): {
  weekday: string;
  day: string;
  month: string;
} {
  const d = parse(iso);
  return {
    weekday: WEEKDAY_BADGE[d.getDay()] ?? "",
    day: pad(d.getDate()),
    month: `THÁNG ${d.getMonth() + 1}`,
  };
}

/**
 * Human "when" line. Today → "Hôm nay lúc 14:32"; tomorrow →
 * "Ngày mai lúc 14:32"; otherwise → "Thứ Năm, 02 Tháng 07 lúc 14:32".
 */
export function formatReminderWhen(iso: string, now: Date = new Date()): string {
  const d = parse(iso);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  if (isSameDay(d, now)) return `Hôm nay lúc ${time}`;
  if (isSameDay(d, tomorrow)) return `Ngày mai lúc ${time}`;

  return `${WEEKDAY_FULL[d.getDay()]}, ${pad(d.getDate())} Tháng ${pad(
    d.getMonth() + 1,
  )} lúc ${time}`;
}

/** Short badge weekday for other surfaces if needed. */
export function reminderWeekdayShort(iso: string): string {
  return WEEKDAY_SHORT[parse(iso).getDay()] ?? "";
}

const REPEAT_LABELS: Record<RepeatType, string> = {
  none: "Nhắc 1 lần",
  daily: "Lặp lại hàng ngày",
  weekly: "Lặp lại hàng tuần",
  monthly: "Lặp lại hàng tháng",
};

export function formatRepeat(repeat: RepeatType): string {
  return REPEAT_LABELS[repeat] ?? REPEAT_LABELS.none;
}
