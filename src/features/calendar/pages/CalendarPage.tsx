import React, { useState, useMemo, useCallback } from "react";
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

  // Get the day of week for the first day (0 = Sunday)
  const startDayOfWeek = firstDay.getDay();

  // Generate days from previous month to fill the first week
  const days: Array<{ date: Date; isCurrentMonth: boolean }> = [];

  // Days from previous month
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const date = new Date(year, month, -i);
    days.push({ date, isCurrentMonth: false });
  }

  // Days from current month
  for (let day = 1; day <= lastDay.getDate(); day++) {
    const date = new Date(year, month, day);
    days.push({ date, isCurrentMonth: true });
  }

  // Days from next month to fill the last week
  const remainingDays = 42 - days.length; // Always show 6 weeks (42 days)
  for (let i = 1; i <= remainingDays; i++) {
    const date = new Date(year, month + 1, i);
    days.push({ date, isCurrentMonth: false });
  }

  return days;
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
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md animate-scale-in rounded-xl bg-white p-6 shadow-lg">
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
 * Calendar page component.
 */
export const CalendarPage: React.FC = () => {
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentView, setCurrentView] = useState<CalendarView>("month");
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

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

  // Check if a date is today
  const isToday = useCallback(
    (date: Date) =>
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear(),
    []
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
  }, [currentMonth]);

  // Navigate to next month
  const goToNextMonth = useCallback(() => {
    if (currentMonth === 11) {
      setCurrentYear((y) => y + 1);
      setCurrentMonth(0);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  }, [currentMonth]);

  // Go to today
  const goToToday = useCallback(() => {
    const now = new Date();
    setCurrentYear(now.getFullYear());
    setCurrentMonth(now.getMonth());
    setSelectedDate(now);
  }, []);

  // Handle mini calendar navigation
  const handleMiniCalendarNavigate = useCallback((year: number, month: number) => {
    setCurrentYear(year);
    setCurrentMonth(month);
    setSelectedDate(new Date(year, month, 1));
  }, []);

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
    <div className="calendar-page flex h-full min-h-0 flex-col bg-[var(--hc-bg-page)]">
      {/* Main container */}
      <div className="flex flex-1 gap-4 overflow-hidden p-4 lg:p-6">
        {/* Left sidebar */}
        <aside className="w-60 shrink-0 overflow-y-auto rounded-xl bg-white shadow-sm">
          <div className="p-4">
            {/* Search */}
            <div className="relative mb-4">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                placeholder="Tìm kiếm sự kiện..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
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

            {/* Add calendar button */}
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
        <div className="flex flex-1 flex-col overflow-hidden rounded-xl bg-white shadow-sm">
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
                  className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-primary hover:bg-surface-hover transition-micro"
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
                      index === 0 ? "text-rose-500" : "text-text-secondary"
                    )}
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar days grid */}
              <div className="grid grid-cols-7 gap-px rounded-lg border border-border bg-border">
                {calendarDays.map((dayInfo, index) => {
                  const dayEvents = getEventsByDate(searchedEvents, dayInfo.date);
                  const maxVisibleEvents = 3;
                  const visibleEvents = dayEvents.slice(0, maxVisibleEvents);
                  const remainingCount = dayEvents.length - maxVisibleEvents;

                  return (
                    <div
                      key={index}
                      onClick={() => handleDateClick(dayInfo.date)}
                      className={clsx(
                        "min-h-[120px] cursor-pointer bg-white p-1.5 transition-micro",
                        !dayInfo.isCurrentMonth && "bg-surface-overlay",
                        dayInfo.isCurrentMonth &&
                          !isToday(dayInfo.date) &&
                          "hover:bg-surface-hover",
                        isSelected(dayInfo.date) &&
                          !isToday(dayInfo.date) &&
                          "bg-primary/5 ring-2 ring-primary/30 ring-inset"
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
                      </div>

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
                              // Could show a popover with all events
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
    </div>
  );
};

export default CalendarPage;
