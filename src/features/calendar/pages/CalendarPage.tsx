import React, { useState, useMemo, useCallback, useEffect } from "react";
import clsx from "clsx";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  XMarkIcon,
  ClockIcon,
  UserCircleIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";
import {
  getCalendarEvents,
  getEventsByDate,
  getEventColor,
  getEventTypeLabel,
  VIETNAMESE_MONTHS,
  VIETNAMESE_WEEKDAYS,
  type CalendarEvent,
  type EventType,
} from "../data/calendarEvents";
import {
  hrApi,
  type AttendanceCalendarDay,
  type ClassificationColor,
} from "../../api/hrApi";

/**
 * Calendar view types.
 */
type CalendarView = "day" | "week" | "month";

/**
 * Calendar type filter for the sidebar.
 */
interface CalendarTypeFilter {
  type: EventType;
  label: string;
  color: string;
  checked: boolean;
}

/**
 * Attendance status color mapping
 */
const ATTENDANCE_COLORS: Record<ClassificationColor, { bg: string; border: string; text: string; dot: string }> = {
  green: {
    bg: "bg-green-50 dark:bg-green-950/30",
    border: "border-green-200 dark:border-green-800",
    text: "text-green-700 dark:text-green-300",
    dot: "bg-green-500",
  },
  yellow: {
    bg: "bg-yellow-50 dark:bg-yellow-950/30",
    border: "border-yellow-200 dark:border-yellow-800",
    text: "text-yellow-700 dark:text-yellow-300",
    dot: "bg-yellow-500",
  },
  orange: {
    bg: "bg-orange-50 dark:bg-orange-950/30",
    border: "border-orange-200 dark:border-orange-800",
    text: "text-orange-700 dark:text-orange-300",
    dot: "bg-orange-500",
  },
  red: {
    bg: "bg-red-50 dark:bg-red-950/30",
    border: "border-red-200 dark:border-red-800",
    text: "text-red-700 dark:text-red-300",
    dot: "bg-red-500",
  },
};

/**
 * Get attendance color styles
 */
const getAttendanceColors = (color: ClassificationColor | null | undefined) => {
  if (!color) {
    return {
      bg: "",
      border: "",
      text: "",
      dot: "bg-gray-400",
    };
  }
  return ATTENDANCE_COLORS[color] || ATTENDANCE_COLORS.green;
};

/**
 * Generate calendar days for a given month.
 */
const generateCalendarDays = (
  year: number,
  month: number
): Array<{ date: Date; isCurrentMonth: boolean }> => {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  const startDayOfWeek = firstDay.getDay();

  const days: Array<{ date: Date; isCurrentMonth: boolean }> = [];

  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const date = new Date(year, month, -i);
    days.push({ date, isCurrentMonth: false });
  }

  for (let day = 1; day <= lastDay.getDate(); day++) {
    const date = new Date(year, month, day);
    days.push({ date, isCurrentMonth: true });
  }

  const remainingDays = 42 - days.length;
  for (let i = 1; i <= remainingDays; i++) {
    const date = new Date(year, month + 1, i);
    days.push({ date, isCurrentMonth: false });
  }

  return days;
};

/**
 * Format date to YYYY-MM-DD
 */
const formatDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/**
 * Format time from HH:mm format
 */
const formatTime = (time: string | null | undefined): string => {
  if (!time) return "--:--";
  return time;
};

/**
 * Format total time (HH:mm)
 */
const formatTotalTime = (totalMinutes: number | null | undefined): string => {
  if (!totalMinutes) return "";
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
};

/**
 * Event detail modal component.
 */
const EventDetailModal: React.FC<{
  event: CalendarEvent;
  onClose: () => void;
}> = ({ event, onClose }) => {
  const colors = getEventColor(event.type);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-md animate-scale-in rounded-xl border border-border bg-surface p-6 shadow-lg">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-primary transition-micro"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>

        <div className="pr-8">
          <div
            className={clsx(
              "mb-3 inline-block rounded-full px-3 py-1 text-xs font-medium",
              colors.bg,
              colors.text
            )}
          >
            {getEventTypeLabel(event.type)}
          </div>

          <h3 className="text-xl font-semibold text-text-primary">
            {event.title}
          </h3>

          <p className="mt-1 text-sm text-text-secondary">
            {event.date}
          </p>

          {event.description && (
            <p className="mt-3 text-sm text-text-secondary">
              {event.description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Attendance detail tooltip component
 */
const AttendanceTooltip: React.FC<{
  attendance: AttendanceCalendarDay;
  onClose: () => void;
}> = ({ attendance, onClose }) => {
  const colors = getAttendanceColors(attendance.classificationColor);

  const getExceptionStatusLabel = (status: string | null | undefined): string => {
    switch (status) {
      case "NONE":
        return "Không cần xử lý";
      case "PENDING_MANAGER_CONFIRMATION":
        return "Chờ quản lý xác nhận";
      case "PENDING_HR_REVIEW":
        return "Chờ HR review";
      case "ESCALATED":
        return "Escalate";
      case "APPROVED":
        return "Đã phê duyệt";
      case "REJECTED":
        return "Từ chối";
      case "RESOLVED":
        return "Đã xử lý";
      default:
        return "Không xác định";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-md animate-scale-in rounded-xl border border-border bg-surface p-6 shadow-lg">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-primary transition-micro"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>

        <div className="pr-8">
          {/* Header with status */}
          <div className="mb-4 flex items-center gap-2">
            <span className={clsx("h-3 w-3 rounded-full", colors.dot)} />
            <span className={clsx("text-sm font-medium", colors.text)}>
              {attendance.classificationLabel || "Chưa có dữ liệu"}
            </span>
          </div>

          {/* Date */}
          <h3 className="text-xl font-semibold text-text-primary">
            {attendance.date && new Date(attendance.date).toLocaleDateString("vi-VN", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </h3>

          {/* Attendance details */}
          <div className="mt-4 space-y-3">
            {/* Time info */}
            <div className="flex items-center gap-3 text-sm">
              <ClockIcon className="h-5 w-5 text-text-muted" />
              <div>
                <span className="text-text-secondary">Giờ vào: </span>
                <span className="font-medium text-text-primary">
                  {formatTime(attendance.firstPunch)}
                </span>
                <span className="mx-2 text-text-muted">—</span>
                <span className="text-text-secondary">Giờ ra: </span>
                <span className="font-medium text-text-primary">
                  {formatTime(attendance.lastPunch)}
                </span>
              </div>
            </div>

            {/* Total time */}
            {attendance.totalMinutes && attendance.totalMinutes > 0 && (
              <div className="flex items-center gap-3 text-sm">
                <ClockIcon className="h-5 w-5 text-text-muted" />
                <div>
                  <span className="text-text-secondary">Tổng giờ làm: </span>
                  <span className="font-medium text-text-primary">
                    {formatTotalTime(attendance.totalMinutes)}
                  </span>
                </div>
              </div>
            )}

            {/* Employee info */}
            {attendance.employeeCode && (
              <div className="flex items-center gap-3 text-sm">
                <UserCircleIcon className="h-5 w-5 text-text-muted" />
                <div>
                  <span className="text-text-secondary">Mã NV: </span>
                  <span className="font-medium text-text-primary">
                    {attendance.employeeCode}
                  </span>
                </div>
              </div>
            )}

            {/* Classification reasons */}
            {attendance.classificationReasons && attendance.classificationReasons.length > 0 && (
              <div className="mt-4">
                <h4 className="mb-2 text-sm font-medium text-text-primary">
                  Lý do:
                </h4>
                <ul className="space-y-1">
                  {attendance.classificationReasons.map((reason, idx) => (
                    <li
                      key={idx}
                      className={clsx(
                        "flex items-start gap-2 text-sm",
                        colors.text
                      )}
                    >
                      <span className="mt-1">•</span>
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Exception status */}
            {attendance.exceptionStatus && attendance.exceptionStatus !== "NONE" && (
              <div className="mt-4 rounded-lg bg-surface-hover p-3">
                <div className="flex items-center gap-2">
                  <ExclamationTriangleIcon className="h-5 w-5 text-orange-500" />
                  <span className="text-sm font-medium text-text-primary">
                    {getExceptionStatusLabel(attendance.exceptionStatus)}
                  </span>
                </div>
                {attendance.exceptionReason && (
                  <p className="mt-2 text-sm text-text-secondary">
                    {attendance.exceptionReason}
                  </p>
                )}
              </div>
            )}

            {/* Action status */}
            {attendance.requiresAction && (
              <div className="mt-4 flex items-center gap-2 rounded-lg bg-orange-50 p-3 dark:bg-orange-950/30">
                <ExclamationTriangleIcon className="h-5 w-5 text-orange-500" />
                <span className="text-sm font-medium text-orange-700 dark:text-orange-300">
                  Cần xử lý
                </span>
              </div>
            )}

            {/* No action needed */}
            {!attendance.requiresAction && attendance.classificationStatus === "PASS" && (
              <div className="mt-4 flex items-center gap-2 rounded-lg bg-green-50 p-3 dark:bg-green-950/30">
                <CheckCircleIcon className="h-5 w-5 text-green-500" />
                <span className="text-sm font-medium text-green-700 dark:text-green-300">
                  Không cần xử lý
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Mini calendar component for the sidebar.
 */
const MiniCalendar: React.FC<{
  year: number;
  month: number;
  onNavigate: (year: number, month: number) => void;
  selectedDate: Date;
}> = ({ year, month, onNavigate, selectedDate }) => {
  const days = generateCalendarDays(year, month);
  const today = new Date();
  const isToday = (date: Date) =>
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();

  const isSelected = (date: Date) =>
    date.getDate() === selectedDate.getDate() &&
    date.getMonth() === selectedDate.getMonth() &&
    date.getFullYear() === selectedDate.getFullYear();

  const handlePrevMonth = () => {
    if (month === 0) {
      onNavigate(year - 1, 11);
    } else {
      onNavigate(year, month - 1);
    }
  };

  const handleNextMonth = () => {
    if (month === 11) {
      onNavigate(year + 1, 0);
    } else {
      onNavigate(year, month + 1);
    }
  };

  return (
    <div className="mini-calendar">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-text-primary">
          {VIETNAMESE_MONTHS[month]} {year}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="rounded p-1 text-text-muted hover:bg-surface-hover hover:text-text-primary transition-micro"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleNextMonth}
            className="rounded p-1 text-text-muted hover:bg-surface-hover hover:text-text-primary transition-micro"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center">
        {VIETNAMESE_WEEKDAYS.map((day) => (
          <div
            key={day}
            className="py-1 text-xs font-medium text-text-muted"
          >
            {day}
          </div>
        ))}

        {days.slice(0, 35).map((dayInfo, index) => (
          <button
            key={index}
            type="button"
            onClick={() => onNavigate(dayInfo.date.getFullYear(), dayInfo.date.getMonth())}
            className={clsx(
              "flex h-7 w-full items-center justify-center rounded text-xs transition-micro",
              !dayInfo.isCurrentMonth && "text-text-disabled",
              dayInfo.isCurrentMonth && !isToday(dayInfo.date) && !isSelected(dayInfo.date) && "text-text-primary hover:bg-surface-hover",
              isToday(dayInfo.date) && "bg-primary text-white font-semibold",
              isSelected(dayInfo.date) && !isToday(dayInfo.date) && "bg-primary/10 text-primary font-medium ring-2 ring-primary/30"
            )}
          >
            {dayInfo.date.getDate()}
          </button>
        ))}
      </div>
    </div>
  );
};

/**
 * Event badge component.
 */
const EventBadge: React.FC<{
  event: CalendarEvent;
  onClick: (event: CalendarEvent) => void;
  compact?: boolean;
}> = ({ event, onClick, compact = false }) => {
  const colors = getEventColor(event.type);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick(event);
      }}
      className={clsx(
        "event-badge block w-full cursor-pointer rounded border text-left transition-micro",
        colors.bg,
        colors.border,
        compact ? "px-1.5 py-0.5 text-xs" : "px-2 py-1 text-xs"
      )}
      title={event.title}
    >
      <span className={clsx("block truncate font-medium", colors.text)}>
        {event.title}
      </span>
    </button>
  );
};

/**
 * Attendance badge component for calendar day cell
 */
const AttendanceBadge: React.FC<{
  attendance: AttendanceCalendarDay;
  onClick: () => void;
}> = ({ attendance, onClick }) => {
  const colors = getAttendanceColors(attendance.classificationColor);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={clsx(
        "attendance-badge block w-full cursor-pointer rounded border text-left transition-micro",
        colors.bg,
        colors.border,
        "px-1.5 py-0.5 text-xs"
      )}
      title={attendance.classificationLabel || "Chưa có dữ liệu chấm công"}
    >
      <div className="flex items-center gap-1">
        <span className={clsx("h-1.5 w-1.5 shrink-0 rounded-full", colors.dot)} />
        <span className={clsx("truncate font-medium", colors.text)}>
          {attendance.firstPunch && attendance.lastPunch
            ? `${formatTime(attendance.firstPunch)} - ${formatTime(attendance.lastPunch)}`
            : attendance.classificationLabel || "Chưa có dữ liệu"}
        </span>
      </div>
      {attendance.classificationLabel && (
        <span className={clsx("block truncate text-[10px] opacity-80", colors.text)}>
          {attendance.classificationLabel}
        </span>
      )}
    </button>
  );
};

/**
 * Attendance legend component
 */
const AttendanceLegend: React.FC = () => (
  <div className="flex flex-wrap items-center gap-4 text-xs">
    <div className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
      <span className="text-text-secondary">Hợp lệ</span>
    </div>
    <div className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full bg-yellow-500" />
      <span className="text-text-secondary">Cần xác nhận</span>
    </div>
    <div className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full bg-orange-500" />
      <span className="text-text-secondary">Cần review</span>
    </div>
    <div className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
      <span className="text-text-secondary">Escalate</span>
    </div>
  </div>
);

/**
 * Calendar page component.
 */
export const CalendarPage: React.FC = () => {
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentView, setCurrentView] = useState<CalendarView>("month");
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [selectedAttendance, setSelectedAttendance] = useState<AttendanceCalendarDay | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Attendance data state
  const [attendanceData, setAttendanceData] = useState<AttendanceCalendarDay[]>([]);
  const [isLoadingAttendance, setIsLoadingAttendance] = useState(false);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);

  // Fetch attendance data when month changes
  useEffect(() => {
    const fetchAttendance = async () => {
      setIsLoadingAttendance(true);
      setAttendanceError(null);

      try {
        const fromDate = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01`;
        const toDate = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${new Date(currentYear, currentMonth + 1, 0).getDate().toString().padStart(2, "0")}`;

        const data = await hrApi.getMyAttendanceCalendar({ from: fromDate, to: toDate });

        if (data.reason === "EMPLOYEE_NOT_LINKED") {
          setAttendanceError("Tài khoản chưa liên kết hồ sơ nhân sự.");
          setAttendanceData([]);
        } else {
          setAttendanceData(data.items ?? []);
        }
      } catch (error: unknown) {
        console.error("Failed to fetch attendance:", error);
        const msg = (error as Error)?.message ?? "";
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (msg.includes("HR_API_HTML_RESPONSE")) {
          setAttendanceError("Không thể kết nối dữ liệu chấm công HRM. Vui lòng kiểm tra cấu hình HR API.");
        } else if (status === 401 || status === 403) {
          setAttendanceError("Phiên đăng nhập hết hạn.");
        } else if (!status) {
          setAttendanceError("Không thể kết nối dữ liệu chấm công HRM.");
        } else {
          setAttendanceError("Không thể tải dữ liệu chấm công.");
        }
        setAttendanceData([]);
      } finally {
        setIsLoadingAttendance(false);
      }
    };

    fetchAttendance();
  }, [currentYear, currentMonth]);

  // Calendar type filters
  const [filters, setFilters] = useState<CalendarTypeFilter[]>([
    { type: "vietnam_holiday", label: "Lịch Việt Nam", color: "bg-rose-500", checked: true },
    { type: "international", label: "Lịch Quốc tế", color: "bg-blue-500", checked: true },
    { type: "work", label: "Công việc", color: "bg-purple-500", checked: true },
    { type: "personal", label: "Cá nhân", color: "bg-amber-500", checked: true },
  ]);

  // Generate events for current year
  const allEvents = useMemo(() => getCalendarEvents(currentYear), [currentYear]);

  // Filter events based on selected filters
  const filteredEvents = useMemo(() => {
    const activeTypes = filters.filter((f) => f.checked).map((f) => f.type);
    return allEvents.filter((event) => activeTypes.includes(event.type));
  }, [allEvents, filters]);

  // Search filtered events
  const searchedEvents = useMemo(() => {
    if (!searchQuery.trim()) return filteredEvents;
    const query = searchQuery.toLowerCase();
    return filteredEvents.filter(
      (event) =>
        event.title.toLowerCase().includes(query) ||
        event.description?.toLowerCase().includes(query)
    );
  }, [filteredEvents, searchQuery]);

  // Generate calendar days
  const calendarDays = useMemo(
    () => generateCalendarDays(currentYear, currentMonth),
    [currentYear, currentMonth]
  );

  // Get attendance for a specific date
  const getAttendanceForDate = useCallback(
    (date: Date): AttendanceCalendarDay | undefined => {
      const dateStr = formatDateString(date);
      return attendanceData.find((a) => a.date === dateStr);
    },
    [attendanceData]
  );

  // Check if a date is today
  const todaySnapshot = React.useMemo(() => new Date(), []);
  const isToday = useCallback(
    (date: Date) =>
      date.getDate() === todaySnapshot.getDate() &&
      date.getMonth() === todaySnapshot.getMonth() &&
      date.getFullYear() === todaySnapshot.getFullYear(),
    [todaySnapshot]
  );

  // Check if a date is selected
  const isSelected = useCallback(
    (date: Date) =>
      date.getDate() === selectedDate.getDate() &&
      date.getMonth() === selectedDate.getMonth() &&
      date.getFullYear() === selectedDate.getFullYear(),
    [selectedDate]
  );

  // Navigate to previous month
  const goToPrevMonth = useCallback(() => {
    if (currentMonth === 0) {
      setCurrentYear((y) => y - 1);
      setCurrentMonth(11);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  }, [currentMonth, setCurrentMonth, setCurrentYear]);

  // Navigate to next month
  const goToNextMonth = useCallback(() => {
    if (currentMonth === 11) {
      setCurrentYear((y) => y + 1);
      setCurrentMonth(0);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  }, [currentMonth, setCurrentMonth, setCurrentYear]);

  // Go to today
  const goToToday = useCallback(() => {
    const now = new Date();
    setCurrentYear(now.getFullYear());
    setCurrentMonth(now.getMonth());
    setSelectedDate(now);
  }, [setCurrentMonth, setCurrentYear, setSelectedDate]);

  // Handle mini calendar navigation
  const handleMiniCalendarNavigate = useCallback((year: number, month: number) => {
    setCurrentYear(year);
    setCurrentMonth(month);
    setSelectedDate(new Date(year, month, 1));
  }, [setCurrentMonth, setCurrentYear, setSelectedDate]);

  // Handle date selection
  const handleDateClick = useCallback((date: Date) => {
    setSelectedDate(date);
  }, []);

  // Toggle filter
  const toggleFilter = useCallback((type: EventType) => {
    setFilters((prev) =>
      prev.map((f) => (f.type === type ? { ...f, checked: !f.checked } : f))
    );
  }, []);

  // View buttons
  const viewButtons: Array<{ id: CalendarView; label: string }> = [
    { id: "day", label: "Ngày" },
    { id: "week", label: "Tuần" },
    { id: "month", label: "Tháng" },
  ];

  return (
    <div className="calendar-page flex h-full min-h-0 flex-col bg-[var(--chat-shell-bg)]">
      {/* Main container */}
      <div className="flex flex-1 gap-4 overflow-hidden p-4 lg:p-6">
        {/* Left sidebar */}
        <aside className="w-60 shrink-0 overflow-y-auto rounded-xl border border-border bg-surface shadow-sm">
          <div className="p-4">
            {/* Search */}
            <div className="relative mb-4">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                placeholder="Tìm kiếm sự kiện..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Mini calendar */}
            <div className="mb-4 rounded-lg border border-border p-3">
              <MiniCalendar
                year={currentYear}
                month={currentMonth}
                onNavigate={handleMiniCalendarNavigate}
                selectedDate={selectedDate}
              />
            </div>

            {/* Attendance legend */}
            <div className="mb-4">
              <h3 className="mb-2 text-sm font-semibold text-text-primary">
                Chấm công
              </h3>
              <AttendanceLegend />
              {isLoadingAttendance && (
                <p className="mt-2 text-xs text-text-muted">Đang tải...</p>
              )}
              {attendanceError && (
                <p className="mt-2 text-xs text-red-500">{attendanceError}</p>
              )}
            </div>

            {/* Calendar types */}
            <div className="mb-4">
              <h3 className="mb-2 text-sm font-semibold text-text-primary">
                Lịch của tôi
              </h3>
              <div className="space-y-2">
                {filters.map((filter) => (
                  <label
                    key={filter.type}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-hover transition-micro"
                  >
                    <input
                      type="checkbox"
                      checked={filter.checked}
                      onChange={() => toggleFilter(filter.type)}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <span
                      className={clsx("h-2.5 w-2.5 rounded-full", filter.color)}
                    />
                    <span className="text-sm text-text-primary">
                      {filter.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <button
              type="button"
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface px-3 py-2 text-sm font-medium text-text-secondary hover:border-primary hover:bg-primary/5 hover:text-primary transition-micro"
            >
              <PlusIcon className="h-4 w-4" />
              Thêm lịch
            </button>
          </div>
        </aside>

        {/* Main calendar area */}
        <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
          {/* Header */}
          <header className="shrink-0 border-b border-border px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Month/Year title and navigation */}
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-text-primary">
                  {VIETNAMESE_MONTHS[currentMonth]} {currentYear}
                </h2>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={goToPrevMonth}
                    className="rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-primary transition-micro"
                  >
                    <ChevronLeftIcon className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={goToNextMonth}
                    className="rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-primary transition-micro"
                  >
                    <ChevronRightIcon className="h-5 w-5" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={goToToday}
                  className="rounded-xl bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary/90 transition-micro"
                >
                  Hôm nay
                </button>
              </div>

              {/* View switcher */}
              <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1">
                {viewButtons.map((view) => (
                  <button
                    key={view.id}
                    type="button"
                    onClick={() => setCurrentView(view.id)}
                    className={clsx(
                      "rounded-md px-3 py-1.5 text-sm font-medium transition-micro",
                      currentView === view.id
                        ? "bg-primary text-white shadow-sm"
                        : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                    )}
                  >
                    {view.label}
                  </button>
                ))}
              </div>
            </div>
          </header>

          {/* Calendar grid */}
          {currentView === "month" && (
            <div className="flex-1 overflow-auto p-4">
              {/* Weekday headers */}
              <div className="mb-2 grid grid-cols-7 gap-px">
                {VIETNAMESE_WEEKDAYS.map((day, index) => (
                  <div
                    key={day}
                    className={clsx(
                      "py-2 text-center text-sm font-medium",
                      index === 0 ? "text-rose-500 dark:text-rose-400" : "text-text-secondary"
                    )}
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar days grid */}
              <div className="grid grid-cols-7 gap-px rounded-lg border border-border bg-surface">
                {calendarDays.map((dayInfo, index) => {
                  const dayEvents = getEventsByDate(searchedEvents, dayInfo.date);
                  const maxVisibleEvents = 2;
                  const visibleEvents = dayEvents.slice(0, maxVisibleEvents);
                  const remainingCount = dayEvents.length - maxVisibleEvents;
                  const attendance = getAttendanceForDate(dayInfo.date);
                  const attendanceColors = getAttendanceColors(attendance?.classificationColor);

                  return (
                    <div
                      key={index}
                      onClick={() => handleDateClick(dayInfo.date)}
                      className={clsx(
                        "min-h-[120px] cursor-pointer border-border bg-surface p-1.5 transition-micro",
                        !dayInfo.isCurrentMonth && "bg-surface-overlay",
                        dayInfo.isCurrentMonth &&
                          !isToday(dayInfo.date) &&
                          "hover:bg-surface-hover",
                        isSelected(dayInfo.date) &&
                          !isToday(dayInfo.date) &&
                          "bg-primary/5 ring-2 ring-primary/30 ring-inset",
                        attendance?.classificationColor &&
                          attendanceColors.bg
                      )}
                    >
                      {/* Date number */}
                      <div className="mb-1 flex items-center justify-between">
                        <span
                          className={clsx(
                            "flex h-7 w-7 items-center justify-center rounded-full text-sm",
                            !dayInfo.isCurrentMonth && "text-text-disabled",
                            dayInfo.isCurrentMonth && !isToday(dayInfo.date) && "text-text-primary",
                            isToday(dayInfo.date) && "bg-primary text-white font-semibold"
                          )}
                        >
                          {dayInfo.date.getDate()}
                        </span>
                        {attendance && (
                          <span className={clsx("h-2 w-2 rounded-full", attendanceColors.dot)} />
                        )}
                      </div>

                      {/* Attendance badge */}
                      {attendance && (
                        <div className="mb-1">
                          <AttendanceBadge
                            attendance={attendance}
                            onClick={() => setSelectedAttendance(attendance)}
                          />
                        </div>
                      )}

                      {/* Events */}
                      <div className="space-y-0.5">
                        {visibleEvents.map((event) => (
                          <EventBadge
                            key={event.id}
                            event={event}
                            onClick={setSelectedEvent}
                            compact
                          />
                        ))}
                        {remainingCount > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                            }}
                            className="block w-full px-1.5 py-0.5 text-xs font-medium text-text-muted hover:text-primary transition-micro"
                          >
                            +{remainingCount} sự kiện
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Day/Week view placeholder */}
          {(currentView === "day" || currentView === "week") && (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <p className="text-lg font-medium text-text-secondary">
                  View "{currentView === "day" ? "Ngày" : "Tuần"}" đang phát triển
                </p>
                <p className="mt-1 text-sm text-text-muted">
                  Chuyển sang view "Tháng" để xem lịch
                </p>
                <button
                  type="button"
                  onClick={() => setCurrentView("month")}
                  className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover transition-micro"
                >
                  Xem lịch Tháng
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Event detail modal */}
      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}

      {/* Attendance tooltip */}
      {selectedAttendance && (
        <AttendanceTooltip
          attendance={selectedAttendance}
          onClose={() => setSelectedAttendance(null)}
        />
      )}
    </div>
  );
};

export default CalendarPage;
