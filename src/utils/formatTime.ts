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
import i18n from "../i18n";
import { getDateFnsLocale } from "../i18n/dateFns";

const isValidDate = (date: Date): boolean => !Number.isNaN(date.getTime());

/**
 * Format time for message timestamp.
 */
export function formatMessageTime(date: Date): string {
  if (!isValidDate(date)) return "";
  const locale = getDateFnsLocale();

  if (isToday(date)) {
    return format(date, "HH:mm", { locale });
  }
  if (isYesterday(date)) {
    return `${i18n.t("chat:time.yesterday")} ${format(date, "HH:mm", { locale })}`;
  }
  if (isThisWeek(date)) {
    return format(date, "EEEE HH:mm", { locale });
  }
  return format(date, "d MMM, HH:mm", { locale });
}

/**
 * Format relative time for conversation list.
 */
export function formatRelativeTime(date: Date): string {
  if (!isValidDate(date)) return "";
  const locale = getDateFnsLocale();

  const now = new Date();
  const minutes = differenceInMinutes(now, date);
  const hours = differenceInHours(now, date);
  const days = differenceInDays(now, date);

  if (minutes < 1) {
    return i18n.t("chat:time.justNow");
  }
  if (minutes < 60) {
    return i18n.t("chat:time.minutesShort", { count: minutes });
  }
  if (hours < 24 && isToday(date)) {
    return i18n.t("chat:time.hoursShort", { count: hours });
  }
  if (isYesterday(date)) {
    return i18n.t("chat:time.yesterday");
  }
  if (days < 7) {
    return format(date, "EEE", { locale });
  }
  return format(date, "dd/MM", { locale });
}

/**
 * Format date divider for message groups.
 */
export function formatDateDivider(date: Date): string {
  if (!isValidDate(date)) return "";
  const locale = getDateFnsLocale();

  if (isToday(date)) {
    return i18n.t("chat:time.today");
  }
  if (isYesterday(date)) {
    return i18n.t("chat:time.yesterday");
  }
  if (isThisWeek(date)) {
    return format(date, "EEEE", { locale });
  }
  return format(date, "EEEE, d MMMM", { locale });
}

/**
 * Format last seen status.
 */
export function formatLastSeen(date: Date | undefined): string {
  const locale = getDateFnsLocale();

  if (!date || !isValidDate(date)) {
    return i18n.t("chat:time.lastSeenRecently");
  }

  const now = new Date();
  const minutes = differenceInMinutes(now, date);

  if (minutes < 1) {
    return i18n.t("chat:time.onlineNow");
  }
  if (minutes < 5) {
    return i18n.t("chat:time.lastSeenRecently");
  }
  if (isToday(date)) {
    return i18n.t("chat:time.lastSeenAt", {
      time: format(date, "HH:mm", { locale }),
    });
  }
  if (isYesterday(date)) {
    return i18n.t("chat:time.lastSeenYesterdayAt", {
      time: format(date, "HH:mm", { locale }),
    });
  }
  if (isThisWeek(date)) {
    return i18n.t("chat:time.lastSeenDayAt", {
      day: format(date, "EEEE", { locale }),
      time: format(date, "HH:mm", { locale }),
    });
  }
  return i18n.t("chat:time.lastSeenDate", {
    date: format(date, "d MMM", { locale }),
  });
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
  return formatDistanceToNow(date, {
    addSuffix: true,
    locale: getDateFnsLocale(),
  });
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
