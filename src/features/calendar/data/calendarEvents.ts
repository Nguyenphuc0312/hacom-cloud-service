/**
 * Calendar event types and holiday data for the Calendar feature.
 * This is static frontend data - no backend API calls.
 */

export type EventType = "vietnam_holiday" | "international" | "work" | "personal";

export interface CalendarEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD format
  type: EventType;
  description?: string;
  color?: string;
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
 * Generate fixed-date events for a given year.
 * These are holidays that occur on the same day every year.
 */
const generateFixedDateEvents = (year: number): CalendarEvent[] => {
  const events: CalendarEvent[] = [];

  // Vietnamese Holidays
  const vietnamHolidays: Array<{
    month: number;
    day: number;
    id: string;
    title: string;
    description: string;
  }> = [
    { month: 1, day: 1, id: "tet-duong-lich", title: "Tết Dương lịch", description: "Năm mới" },
    { month: 2, day: 3, id: "thanh-lap-dang", title: "Ngày thành lập Đảng", description: "Ngày thành lập Đảng Cộng sản Việt Nam" },
    { month: 3, day: 8, id: "quoc-te-phu-nu", title: "Quốc tế Phụ nữ", description: "Ngày Quốc tế Phụ nữ 8/3" },
    { month: 4, day: 30, id: "giai-phong-mien-nam", title: "Giải phóng miền Nam", description: "Ngày Giải phóng miền Nam Việt Nam" },
    { month: 5, day: 1, id: "quoc-te-lao-dong", title: "Quốc tế Lao động", description: "Ngày Quốc tế Lao động" },
    { month: 6, day: 1, id: "quoc-te-thieu-nhi", title: "Quốc tế Thiếu nhi", description: "Ngày Quốc tế Thiếu nhi" },
    { month: 7, day: 27, id: "thuong-binh-liet-si", title: "Thương binh Liệt sĩ", description: "Ngày Thương binh Liệt sĩ" },
    { month: 9, day: 2, id: "quoc-khanh", title: "Quốc khánh", description: "Quốc khánh Việt Nam" },
    { month: 10, day: 20, id: "phu-nu-viet-nam", title: "Ngày Phụ nữ Việt Nam", description: "Ngày Phụ nữ Việt Nam 20/10" },
    { month: 11, day: 20, id: "nha-giao-viet-nam", title: "Ngày Nhà giáo Việt Nam", description: "Ngày Nhà giáo Việt Nam 20/11" },
    { month: 12, day: 22, id: "thanh-lap-quan-doi", title: "Thành lập Quân đội", description: "Ngày thành lập Quân đội Nhân dân Việt Nam" },
  ];

  // International Holidays
  const internationalHolidays: Array<{
    month: number;
    day: number;
    id: string;
    title: string;
    description: string;
  }> = [
    { month: 2, day: 14, id: "valentine", title: "Valentine", description: "Ngày lễ tình nhân" },
    { month: 4, day: 22, id: "earth-day", title: "Earth Day", description: "Ngày Trái Đất" },
    { month: 6, day: 5, id: "world-environment-day", title: "World Environment Day", description: "Ngày Môi trường Thế giới" },
    { month: 10, day: 31, id: "halloween", title: "Halloween", description: "Lễ hội Halloween" },
    { month: 12, day: 25, id: "christmas", title: "Christmas", description: "Giáng sinh" },
  ];

  // Generate Vietnamese holidays
  vietnamHolidays.forEach((holiday) => {
    const dateStr = `${year}-${String(holiday.month).padStart(2, "0")}-${String(holiday.day).padStart(2, "0")}`;
    events.push({
      id: `${holiday.id}-${year}`,
      title: holiday.title,
      date: dateStr,
      type: "vietnam_holiday",
      description: holiday.description,
    });
  });

  // Generate International holidays
  internationalHolidays.forEach((holiday) => {
    const dateStr = `${year}-${String(holiday.month).padStart(2, "0")}-${String(holiday.day).padStart(2, "0")}`;
    events.push({
      id: `${holiday.id}-${year}`,
      title: holiday.title,
      date: dateStr,
      type: "international",
      description: holiday.description,
    });
  });

  return events;
};

/**
 * Get all calendar events for a given year.
 * Call this function with the current year to get all events.
 */
export const getCalendarEvents = (year: number): CalendarEvent[] => {
  return generateFixedDateEvents(year);
};

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
    default:
      return "Khác";
  }
};
