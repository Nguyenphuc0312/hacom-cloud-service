/**
 * Calendar event types and holiday data for the Calendar feature.
 * This is static frontend data - no backend API calls.
 */

export type EventType = "vietnam_holiday" | "international" | "work" | "personal" | "task" | "meeting" | "attendance";

export interface CalendarEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD format
  type: EventType;
  description?: string;
  color?: string;
  /** Time slot or specific time, e.g. "Sáng", "14:00", "14h00" */
  time?: string;
  /** Set when type === "task" */
  taskId?: string;
  /** Set when type === "task": priority indicator */
  taskPriority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  /** Set when type === "task": whether the task is overdue */
  taskOverdue?: boolean;
}

/**
 * Extended calendar event with full API data for detail view.
 * Used when displaying event details with time, location, attendees, etc.
 */
export interface ExtendedCalendarEvent extends CalendarEvent {
  /** Full start timestamp from API */
  startAt?: string;
  /** Full end timestamp from API */
  endAt?: string;
  /** All-day event → render ở hàng "Cả ngày" thay vì trên lưới giờ */
  isAllDay?: boolean;
  /** Meeting format: "offline" | "online" | null */
  meetingFormat?: "offline" | "online";
  /** Meeting location (for offline) or URL (for online) */
  meetingLocation?: string;
  /** Meeting chairman name */
  meetingChairman?: string;
  /** List of attendee names */
  attendees?: string[];
  /** Event visibility */
  visibility?: "PRIVATE" | "BUSY_ONLY" | "TEAM" | "UNIT" | "PUBLIC";
  /** Event status */
  status?: "CONFIRMED" | "TENTATIVE" | "CANCELLED";
  /** Owner employee ID (from hr-api-service CalendarEvent.ownerId) */
  ownerId?: string;
  /** Owner user ID (from chat-api-service CalendarEvent.ownerUserId) */
  ownerUserId?: string;
  /** Can current user edit this event */
  canEdit?: boolean;
  /** Can current user delete this event */
  canDelete?: boolean;
  /** Whether current user is the owner */
  isOwner?: boolean;
}

/**
 * Get Vietnamese month names.
 */
export const VIETNAMESE_MONTHS = [
  "Tháng 1",
  "Tháng 2",
  "Tháng 3",
  "Tháng 4",
  "Tháng 5",
  "Tháng 6",
  "Tháng 7",
  "Tháng 8",
  "Tháng 9",
  "Tháng 10",
  "Tháng 11",
  "Tháng 12",
] as const;

/**
 * Get Vietnamese weekday names (starting with Sunday).
 */
export const VIETNAMESE_WEEKDAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"] as const;

/**
 * Filter events by date.
 */
export const getEventsByDate = (
  events: CalendarEvent[],
  date: Date
): CalendarEvent[] => {
  const dateStr = formatDateString(date);
  return events.filter((event) => event.date === dateStr);
};

/**
 * Format a Date object to YYYY-MM-DD string.
 */
export const formatDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/**
 * Get event color based on type.
 * Returns a CSS class pair — background/text — that works in both light and dark modes.
 * Uses opacity modifier so the color reads correctly on both light and dark surfaces.
 */
/**
 * Màu nổi bật (vàng) cho lịch dài ngày (qua đêm / nhiều ngày) — phân biệt rõ với
 * event trong ngày để đỡ rối. Dùng chung cho cả month/day/week view.
 */
export const MULTI_DAY_EVENT_COLOR = {
  bg: "bg-amber-500/40",
  text: "text-amber-900 dark:text-amber-100",
  border: "border-amber-600/70",
} as const;

export const getEventColor = (type: EventType): { bg: string; text: string; border: string } => {
  switch (type) {
    case "vietnam_holiday":
      return { bg: "bg-rose-500/10", text: "text-rose-600 dark:text-rose-300", border: "border-rose-500/20" };
    case "international":
      return { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-300", border: "border-blue-500/20" };
    case "work":
      return { bg: "bg-purple-500/10", text: "text-purple-600 dark:text-purple-300", border: "border-purple-500/20" };
    case "personal":
      return { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-300", border: "border-amber-500/20" };
    case "task":
      return { bg: "bg-indigo-500/10", text: "text-indigo-600 dark:text-indigo-300", border: "border-indigo-500/20" };
    case "meeting":
      return { bg: "bg-teal-500/10", text: "text-teal-600 dark:text-teal-300", border: "border-teal-500/20" };
    case "attendance":
      return { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-300", border: "border-emerald-500/20" };
    default:
      return { bg: "bg-gray-500/10", text: "text-gray-600 dark:text-gray-300", border: "border-gray-500/20" };
  }
};

/**
 * Get type label in Vietnamese.
 */
export const getEventTypeLabel = (type: EventType): string => {
  switch (type) {
    case "vietnam_holiday":
      return "Việt Nam";
    case "international":
      return "Quốc tế";
    case "work":
      return "Công việc";
    case "personal":
      return "Cá nhân";
    case "task":
      return "Công việc";
    case "meeting":
      return "Lịch họp";
    case "attendance":
      return "Chấm công";
    default:
      return "Khác";
  }
};
