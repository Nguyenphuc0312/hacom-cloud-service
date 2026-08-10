export type LeaveDayPortion = "FULL" | "AM" | "PM";

const parseDateOnly = (value: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
};

const inclusiveDayCount = (start: Date, end: Date): number =>
  Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;

export const calculateLeaveDays = (
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
