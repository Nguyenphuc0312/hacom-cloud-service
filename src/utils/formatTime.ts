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

/**
 * Format time for message timestamp
 * Shows: "10:30" for today, "Hôm qua 10:30" for yesterday
 */
export function formatMessageTime(date: Date): string {
  if (isToday(date)) {
    return format(date, "HH:mm");
  }
  if (isYesterday(date)) {
    return `Hôm qua ${format(date, "HH:mm")}`;
  }
  if (isThisWeek(date)) {
    return format(date, "EEEE HH:mm", { locale: vi });
  }
  return format(date, "d MMM, HH:mm", { locale: vi });
}

/**
 * Format relative time for conversation list
 * Shows: "3p", "1g", "Hôm qua", "T2", "15/01"
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const minutes = differenceInMinutes(now, date);
  const hours = differenceInHours(now, date);
  const days = differenceInDays(now, date);

  if (minutes < 1) {
    return "Vừa xong";
  }
  if (minutes < 60) {
    return `${minutes}p`;
  }
  if (hours < 24 && isToday(date)) {
    return `${hours}g`;
  }
  if (isYesterday(date)) {
    return "Hôm qua";
  }
  if (days < 7) {
    return format(date, "EEE", { locale: vi });
  }
  return format(date, "dd/MM", { locale: vi });
}

/**
 * Format date divider for message groups
 * Shows: "Hôm nay", "Hôm qua", "Thứ Hai, 15 tháng 1"
 */
export function formatDateDivider(date: Date): string {
  if (isToday(date)) {
    return "Hôm nay";
  }
  if (isYesterday(date)) {
    return "Hôm qua";
  }
  if (isThisWeek(date)) {
    return format(date, "EEEE", { locale: vi });
  }
  return format(date, "EEEE, d MMMM", { locale: vi });
}

/**
 * Format last seen status
 * Shows: "truy cập lúc 10:30", "truy cập hôm qua", etc.
 */
export function formatLastSeen(date: Date | undefined): string {
  if (!date) {
    return "truy cập gần đây";
  }

  const now = new Date();
  const minutes = differenceInMinutes(now, date);

  if (minutes < 1) {
    return "vừa truy cập";
  }
  if (minutes < 5) {
    return "truy cập gần đây";
  }
  if (isToday(date)) {
    return `truy cập lúc ${format(date, "HH:mm")}`;
  }
  if (isYesterday(date)) {
    return `truy cập hôm qua lúc ${format(date, "HH:mm")}`;
  }
  if (isThisWeek(date)) {
    return `truy cập ${format(date, "EEEE", { locale: vi })} lúc ${format(date, "HH:mm")}`;
  }
  return `truy cập ${format(date, "d MMM", { locale: vi })}`;
}

/**
 * Format voice message duration
 * Shows: "0:45", "1:23", "12:34"
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Format relative time in Vietnamese (optional)
 */
export function formatRelativeTimeVi(date: Date): string {
  return formatDistanceToNow(date, { addSuffix: true, locale: vi });
}

/**
 * Check if two dates are on the same day
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}
