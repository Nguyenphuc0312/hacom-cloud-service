import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  XMarkIcon,
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
} from "../../api/hrApi";
import { MeetingFormModal, type MeetingFormData } from "../../../components/ui/MeetingFormModal";
import { taskApi } from "../../tasks/api/taskApi";
import { toast } from "../../../utils/toast";

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
 * Event detail modal component.
 */
const EventDetailModal: React.FC<{
  event: CalendarEvent;
  onClose: () => void;
}> = ({ event, onClose }) => {
  const colors = getEventColor(event.type);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-md animate-scale-in rounded-xl border border-border bg-surface p-6 shadow-lg">
        <button
          type="button"
          onClick={onClose}
          title="Đóng"
          className="absolute right-4 top-4 rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-primary transition-micro"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>

        <div className="pr-8 max-h-[calc(100dvh-6rem)] overflow-y-auto">
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
            title="Tháng trước"
            className="rounded p-1 text-text-muted hover:bg-surface-hover hover:text-text-primary transition-micro"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleNextMonth}
            title="Tháng sau"
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
              isToday(dayInfo.date) && "bg-[#C41E3A] text-white font-semibold",
              isSelected(dayInfo.date) && !isToday(dayInfo.date) && "bg-[#FFC857]/20 text-[#C41E3A] font-medium ring-2 ring-[#FFC857]/40"
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
}> = ({ attendance }) => {
  const hasPunch = !!(attendance.firstPunch || attendance.lastPunch);

  return (
    <div
      className="attendance-badge block w-full rounded border border-border bg-surface px-1.5 py-0.5 text-left text-xs"
      title={hasPunch ? `Giờ đến: ${formatTime(attendance.firstPunch)} · Giờ về: ${formatTime(attendance.lastPunch)}` : "Chưa có dữ liệu chấm công"}
    >
      {hasPunch ? (
        <span className="block space-y-0.5">
          <span className="block truncate text-text-secondary">Giờ đến: <span className="font-medium text-text-primary">{formatTime(attendance.firstPunch)}</span></span>
          <span className="block truncate text-text-secondary">Giờ về: <span className="font-medium text-text-primary">{formatTime(attendance.lastPunch)}</span></span>
        </span>
      ) : (
        <span className="block truncate text-text-muted">Chưa chấm công</span>
      )}
    </div>
  );
};

/**
 * Attendance legend component
 */
/**
 * Calendar page component.
 */
export const CalendarPage: React.FC = () => {
  const today = new Date();
  const navigate = useNavigate();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentView, setCurrentView] = useState<CalendarView>("month");
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Attendance data state
  const [attendanceData, setAttendanceData] = useState<AttendanceCalendarDay[]>([]);
  const [, setIsLoadingAttendance] = useState(false);
  const [, setAttendanceError] = useState<string | null>(null);

  // Task events state
  const [taskEvents, setTaskEvents] = useState<CalendarEvent[]>([]);

  // Meeting form modal state
  const [meetingModalOpen, setMeetingModalOpen] = useState(false);
  const [meetingModalDate, setMeetingModalDate] = useState<string | undefined>();
  const [localMeetings, setLocalMeetings] = useState<MeetingFormData[]>([]);

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
        } else if (data.reason === "NO_ATTENDANCE_DATA") {
          setAttendanceError("Chưa có dữ liệu chấm công trong khoảng thời gian này.");
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

  // Fetch tasks with dueDate in current month range
  useEffect(() => {
    const fetchTaskEvents = async () => {
      try {
        const from = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01`;
        const lastDay = new Date(currentYear, currentMonth + 1, 0).getDate();
        const to = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
        const tasks = await taskApi.getCalendarTasks(from, to);
        const events: CalendarEvent[] = tasks.map((task) => ({
          id: `task:${task.id}`,
          title: task.title,
          date: task.dueDate!.slice(0, 10),
          type: "task" as const,
          description: task.description ?? undefined,
          taskId: task.id,
          taskPriority: task.priority,
          taskOverdue:
            task.status !== "DONE" && new Date(task.dueDate!) < new Date(),
        }));
        setTaskEvents(events);
      } catch {
        setTaskEvents([]);
        toast.warning("Không thể tải nhiệm vụ trên lịch");
      }
    };
    void fetchTaskEvents();
  }, [currentYear, currentMonth]);

  // Calendar type filters
  const [filters, setFilters] = useState<CalendarTypeFilter[]>([
    { type: "meeting", label: "Lịch họp", color: "bg-teal-500", checked: true },
    { type: "personal", label: "Cá nhân", color: "bg-amber-500", checked: true },
    { type: "attendance", label: "Chấm công", color: "bg-emerald-500", checked: true },
  ]);

  // Generate events for current year, merged with task events
  const allEvents = useMemo(
    () => [...getCalendarEvents(currentYear), ...taskEvents],
    [currentYear, taskEvents],
  );

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

  // Handle event click — navigate to /tasks for task events, open modal otherwise
  const handleEventClick = useCallback(
    (event: CalendarEvent) => {
      if (event.type === "task" && event.taskId) {
        navigate(`/tasks?taskId=${event.taskId}`);
      } else {
        setSelectedEvent(event);
      }
    },
    [navigate, setSelectedEvent],
  );

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
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-[#FFC857]/60 focus:outline-none focus:ring-2 focus:ring-[#FFC857]/15"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  title="Xóa tìm kiếm"
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

            {/* Attendance legend — tạm ẩn */}

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
                      className="h-4 w-4 rounded border-border accent-[#C41E3A] focus:ring-2 focus:ring-[#FFC857]/30"
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
              onClick={() => {
                setMeetingModalDate(formatDateString(selectedDate));
                setMeetingModalOpen(true);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface px-3 py-2 text-sm font-medium text-text-secondary hover:border-[#C41E3A]/60 hover:bg-[#C41E3A]/5 hover:text-[#C41E3A] transition-micro"
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
                    title="Tháng trước"
                    className="rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-primary transition-micro"
                  >
                    <ChevronLeftIcon className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={goToNextMonth}
                    title="Tháng sau"
                    className="rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-primary transition-micro"
                  >
                    <ChevronRightIcon className="h-5 w-5" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={goToToday}
                  className="rounded-xl bg-gradient-to-r from-[#C41E3A] via-[#D32F2F] to-[#FFC857] px-4 py-1.5 text-sm font-medium text-white hover:brightness-105 active:scale-95 shadow-sm shadow-[#C41E3A]/25 transition-micro"
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
                        ? "bg-gradient-to-r from-[#C41E3A] to-[#D32F2F] text-white shadow-sm"
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
                          "ring-1 ring-border-strong ring-inset"
                      )}
                    >
                      {/* Date number */}
                      <div className="mb-1 flex items-center justify-between">
                        <span
                          className={clsx(
                            "flex h-7 w-7 items-center justify-center rounded-full text-sm",
                            !dayInfo.isCurrentMonth && "text-text-disabled",
                            dayInfo.isCurrentMonth && !isToday(dayInfo.date) && "text-text-primary",
                            isToday(dayInfo.date) && "bg-[#C41E3A] text-white font-semibold"
                          )}
                        >
                          {dayInfo.date.getDate()}
                        </span>
                      </div>

                      {/* Attendance badge */}
                      {attendance && filters.find((f) => f.type === "attendance")?.checked && (
                        <div className="mb-1">
                          <AttendanceBadge attendance={attendance} />
                        </div>
                      )}

                      {/* Events */}
                      <div className="space-y-0.5">
                        {visibleEvents.map((event) => (
                          <EventBadge
                            key={event.id}
                            event={event}
                            onClick={handleEventClick}
                            compact
                          />
                        ))}
                        {remainingCount > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                            }}
                            className="block w-full px-1.5 py-0.5 text-xs font-medium text-text-muted hover:text-[#C41E3A] transition-micro"
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
                  className="mt-3 rounded-lg bg-[#C41E3A] px-4 py-2 text-sm font-medium text-white hover:brightness-105 transition-micro"
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

      {/* Meeting form modal */}
      <MeetingFormModal
        isOpen={meetingModalOpen}
        onClose={() => setMeetingModalOpen(false)}
        onSave={(data) => setLocalMeetings((prev) => [...prev, data])}
        defaultDate={meetingModalDate}
        existingMeetings={localMeetings}
      />

    </div>
  );
};

export default CalendarPage;
