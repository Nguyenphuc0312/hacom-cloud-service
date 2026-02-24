import {
  format,
  formatDistanceToNow,
  isToday,
  isYesterday,
  isThisWeek,
  differenceInMinutes,
  differenceInHours,
  differenceInDays,
} from "date-fns";
import { vi } from "date-fns/locale";

const isValidDate = (date: Date): boolean => !Number.isNaN(date.getTime());

/**
 * Format time for message timestamp.
 */
export function formatMessageTime(date: Date): string {
  if (!isValidDate(date)) return "";

  if (isToday(date)) {
    return format(date, "HH:mm");
  }
  if (isYesterday(date)) {
    return `Yesterday ${format(date, "HH:mm")}`;
  }
  if (isThisWeek(date)) {
    return format(date, "EEEE HH:mm", { locale: vi });
  }
  return format(date, "d MMM, HH:mm", { locale: vi });
}

/**
 * Format relative time for conversation list.
 */
export function formatRelativeTime(date: Date): string {
  if (!isValidDate(date)) return "";

  const now = new Date();
  const minutes = differenceInMinutes(now, date);
  const hours = differenceInHours(now, date);
  const days = differenceInDays(now, date);

  if (minutes < 1) {
    return "Just now";
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }
  if (hours < 24 && isToday(date)) {
    return `${hours}h`;
  }
  if (isYesterday(date)) {
    return "Yesterday";
  }
  if (days < 7) {
    return format(date, "EEE", { locale: vi });
  }
  return format(date, "dd/MM", { locale: vi });
}

/**
 * Format date divider for message groups.
 */
export function formatDateDivider(date: Date): string {
  if (!isValidDate(date)) return "";

  if (isToday(date)) {
    return "Today";
  }
  if (isYesterday(date)) {
    return "Yesterday";
  }
  if (isThisWeek(date)) {
    return format(date, "EEEE", { locale: vi });
  }
  return format(date, "EEEE, d MMMM", { locale: vi });
}

/**
 * Format last seen status.
 */
export function formatLastSeen(date: Date | undefined): string {
  if (!date || !isValidDate(date)) {
    return "Last seen recently";
  }

  const now = new Date();
  const minutes = differenceInMinutes(now, date);

  if (minutes < 1) {
    return "Online now";
  }
  if (minutes < 5) {
    return "Last seen recently";
  }
  if (isToday(date)) {
    return `Last seen at ${format(date, "HH:mm")}`;
  }
  if (isYesterday(date)) {
    return `Last seen yesterday at ${format(date, "HH:mm")}`;
  }
  if (isThisWeek(date)) {
    return `Last seen ${format(date, "EEEE", { locale: vi })} ${format(
      date,
      "HH:mm",
    )}`;
  }
  return `Last seen ${format(date, "d MMM", { locale: vi })}`;
}

/**
 * Format voice message duration.
 */
export function formatDuration(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const mins = Math.floor(safeSeconds / 60);
  const secs = Math.floor(safeSeconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Format relative time with locale.
 */
export function formatRelativeTimeVi(date: Date): string {
  if (!isValidDate(date)) return "";
  return formatDistanceToNow(date, { addSuffix: true, locale: vi });
}

/**
 * Check if two dates are on the same day.
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  if (!isValidDate(date1) || !isValidDate(date2)) return false;

  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}
