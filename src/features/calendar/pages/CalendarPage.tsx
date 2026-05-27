import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  XMarkIcon,
  UserIcon,
  BuildingOfficeIcon,
  CalendarIcon,
  ClockIcon,
  MapPinIcon,
  VideoCameraIcon,
  UsersIcon,
  PencilSquareIcon,
  TrashIcon,
  ExclamationCircleIcon,
} from "@heroicons/react/24/outline";
import {
  getCalendarEvents,
  getEventsByDate,
  getEventColor,
  getEventTypeLabel,
  VIETNAMESE_MONTHS,
  VIETNAMESE_WEEKDAYS,
  type CalendarEvent as LocalCalendarEvent,
  type ExtendedCalendarEvent,
  type EventType,
} from "../data/calendarEvents";
import {
  hrApi,
  type AttendanceCalendarDay,
} from "../../api/hrApi";
import { MeetingFormModal, type MeetingFormData } from "../../../components/ui/MeetingFormModal";
import { ConfirmDialog } from "../../../components/ui/Modal";
import { taskApi } from "../../tasks/api/taskApi";
import { toast } from "../../../utils/toast";
import { useCalendarStore } from "../../../stores/calendarStore";
import { useAuthStore } from "../../../stores";
import { DayView } from "../components/DayView";
import { WeekView } from "../components/WeekView";
import { UserSearchModal } from "../../../components/ui/UserSearchModal";

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
 * Helper to format date string to Vietnamese format
 */
const formatDateVN = (dateStr: string): string => {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("vi-VN", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
};

/**
 * Format time string (HH:mm:ss or HH:mm) for modal display
 */
const formatTimeStr = (timeStr: string): string => {
  if (!timeStr) return "";
  const parts = timeStr.split(":");
  if (parts.length >= 2) {
    return `${parts[0]}:${parts[1]}`;
  }
  return timeStr;
};

/**
 * Calculate duration between two timestamps
 */
const calculateDuration = (startAt: string, endAt: string): string => {
  try {
    const start = new Date(startAt);
    const end = new Date(endAt);
    const diffMs = end.getTime() - start.getTime();
    const diffMins = Math.round(diffMs / 60000);

    if (diffMins < 60) {
      return `${diffMins} phút`;
    }
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    if (mins === 0) {
      return `${hours} giờ`;
    }
    return `${hours} giờ ${mins} phút`;
  } catch {
    return "";
  }
};

/**
 * Get status badge color
 */
const getStatusBadge = (status?: string): { bg: string; text: string; label: string } => {
  switch (status) {
    case "CONFIRMED":
      return { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-300", label: "Đã xác nhận" };
    case "TENTATIVE":
      return { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-300", label: "Dự kiến" };
    case "CANCELLED":
      return { bg: "bg-rose-500/10", text: "text-rose-600 dark:text-rose-300", label: "Đã hủy" };
    default:
      return { bg: "bg-gray-500/10", text: "text-gray-600 dark:text-gray-300", label: status ?? "Không xác định" };
  }
};

/**
 * Event detail modal component with rich display.
 * Works with both LocalCalendarEvent and ExtendedCalendarEvent.
 */
const EventDetailModal: React.FC<{
  event: LocalCalendarEvent | ExtendedCalendarEvent;
  currentUserId?: string;
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}> = ({ event, currentUserId, onClose, onEdit, onDelete }) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [showEditConfirm, setShowEditConfirm] = React.useState(false);
  const colors = getEventColor(event.type);
  const isExtended = "startAt" in event && event.startAt;

  // Check if current user is the owner
  const isOwner = "ownerUserId" in event && event.ownerUserId === currentUserId;
  const canEdit = isOwner && onEdit;
  const canDelete = isOwner && onDelete;

  // Get status badge info
  const statusInfo = "status" in event ? getStatusBadge(event.status) : null;

  // Time display
  const startTime = isExtended && "startAt" in event ? formatTimeStr(event.startAt!) : event.time;
  const endTime = isExtended && "endAt" in event ? formatTimeStr(event.endAt!) : null;
  const duration = isExtended && "startAt" in event && "endAt" in event && event.startAt && event.endAt
    ? calculateDuration(event.startAt, event.endAt)
    : null;

  // Location/Meeting URL
  const location = "meetingLocation" in event ? event.meetingLocation : null;
  const format = "meetingFormat" in event ? event.meetingFormat : null;
  const chairman = "meetingChairman" in event ? event.meetingChairman : null;
  const attendees = "attendees" in event ? event.attendees : null;
  const visibility = "visibility" in event ? event.visibility : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-lg animate-scale-in rounded-xl border border-border bg-surface p-6 shadow-lg">
        <button
          type="button"
          onClick={onClose}
          title="Đóng"
          className="absolute right-4 top-4 rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-primary transition-micro"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>

        <div className="max-h-[calc(100vh-8rem)] overflow-y-auto pr-8">
          {/* Header: Type badge + Status badge */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div
              className={clsx(
                "inline-block rounded-full px-3 py-1 text-xs font-medium",
                colors.bg,
                colors.text
              )}
            >
              {getEventTypeLabel(event.type)}
            </div>
            {statusInfo && (
              <div
                className={clsx(
                  "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                  statusInfo.bg,
                  statusInfo.text
                )}
              >
                {statusInfo.label}
              </div>
            )}
          </div>

          {/* Title */}
          <h3 className="text-xl font-semibold text-text-primary">
            {event.title}
          </h3>

          {/* Date and Time Section */}
          <div className="mt-4 space-y-2">
            {/* Date */}
            <div className="flex items-start gap-3">
              <CalendarIcon className="mt-0.5 h-5 w-5 shrink-0 text-text-muted" />
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {event.date}
                </p>
                {isExtended && event.startAt && (
                  <p className="text-xs text-text-muted">
                    {formatDateVN(event.startAt)}
                  </p>
                )}
              </div>
            </div>

            {/* Time (for API events with startAt) */}
            {isExtended && startTime && (
              <div className="flex items-start gap-3">
                <ClockIcon className="mt-0.5 h-5 w-5 shrink-0 text-text-muted" />
                <div>
                  <p className="text-sm text-text-primary">
                    {startTime}
                    {endTime && ` — ${endTime}`}
                  </p>
                  {duration && (
                    <p className="text-xs text-text-muted">
                      Thời lượng: {duration}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Location / Meeting Link */}
            {location && (
              <div className="flex items-start gap-3">
                {format === "online" ? (
                  <VideoCameraIcon className="mt-0.5 h-5 w-5 shrink-0 text-teal-600 dark:text-teal-400" />
                ) : (
                  <MapPinIcon className="mt-0.5 h-5 w-5 shrink-0 text-text-muted" />
                )}
                <p className="text-sm text-text-primary break-all">
                  {location}
                </p>
              </div>
            )}

            {/* Chairman */}
            {chairman && (
              <div className="flex items-start gap-3">
                <UserIcon className="mt-0.5 h-5 w-5 shrink-0 text-teal-600 dark:text-teal-400" />
                <div>
                  <p className="text-xs font-medium text-teal-600 dark:text-teal-400">
                    Chủ trì
                  </p>
                  <p className="text-sm text-text-primary">
                    {chairman}
                  </p>
                </div>
              </div>
            )}

            {/* Attendees */}
            {attendees && attendees.length > 0 && (
              <div className="flex items-start gap-3">
                <UsersIcon className="mt-0.5 h-5 w-5 shrink-0 text-teal-600 dark:text-teal-400" />
                <div className="flex-1">
                  <p className="text-xs font-medium text-teal-600 dark:text-teal-400">
                    Thành phần ({attendees.length})
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {attendees.slice(0, 10).map((name, idx) => (
                      <span
                        key={`${name}-${idx}`}
                        className="inline-flex items-center rounded-full bg-surface-hover px-2 py-0.5 text-xs text-text-primary"
                      >
                        {name}
                      </span>
                    ))}
                    {attendees.length > 10 && (
                      <span className="inline-flex items-center rounded-full bg-surface-hover px-2 py-0.5 text-xs text-text-muted">
                        +{attendees.length - 10} người khác
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Visibility */}
            {visibility && (
              <div className="flex items-center gap-3">
                <ExclamationCircleIcon className="h-5 w-5 shrink-0 text-text-muted" />
                <p className="text-xs text-text-muted">
                  {visibility === "PRIVATE" ? "Riêng tư" :
                    visibility === "TEAM" ? "Nhóm" :
                    visibility === "UNIT" ? "Đơn vị" :
                    visibility === "PUBLIC" ? "Công khai" :
                    "Chỉ hiển thị trạng thái bận"}
                </p>
              </div>
            )}
          </div>

          {/* Description */}
          {event.description && (
            <div className="mt-4 border-t border-border pt-4">
              <p className="text-sm text-text-secondary whitespace-pre-wrap">
                {event.description}
              </p>
            </div>
          )}

          {/* Action buttons */}
          {(canEdit || canDelete) && (
            <div className="mt-6 flex items-center justify-end gap-2 border-t border-border pt-4">
              {canDelete && (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-danger/30 bg-danger/10 px-3 py-1.5 text-xs font-medium text-danger transition-micro hover:bg-danger/20"
                >
                  <TrashIcon className="h-4 w-4" />
                  Xóa
                </button>
              )}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setShowEditConfirm(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition-micro hover:bg-primary/90"
                >
                  <PencilSquareIcon className="h-4 w-4" />
                  Chỉnh sửa
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => {
          setShowDeleteConfirm(false);
          onDelete?.();
        }}
        title="Xóa sự kiện"
        message="Bạn có chắc muốn xóa sự kiện này? Hành động không thể hoàn tác."
        confirmText="Xóa"
        variant="danger"
      />
      <ConfirmDialog
        isOpen={showEditConfirm}
        onClose={() => setShowEditConfirm(false)}
        onConfirm={() => {
          setShowEditConfirm(false);
          onEdit?.();
        }}
        title="Chỉnh sửa sự kiện"
        message="Bạn có muốn chỉnh sửa sự kiện này không?"
        confirmText="Chỉnh sửa"
        cancelText="Hủy"
        variant="info"
      />
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
              isToday(dayInfo.date) && "bg-[#1565C0] text-white font-semibold",
              isSelected(dayInfo.date) && !isToday(dayInfo.date) && "bg-[#1976D2]/10 text-[#1565C0] font-medium ring-2 ring-[#1976D2]/40"
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
  event: LocalCalendarEvent;
  onClick: (event: LocalCalendarEvent) => void;
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
 * Calendar page component.
 */
export const CalendarPage: React.FC = () => {
  const today = new Date();
  const navigate = useNavigate();
  
  // Calendar store
  const storeState = useCalendarStore();
  const {
    mode,
    view: currentView,
    setView,
    events: apiEvents,
    viewingUserName,
    viewingUnitName,
    filters,
    setFilters,
    setViewingUser,
    fetchEvents,
    deleteEvent,
  } = storeState;

  // Current user for permission checks
  const currentUser = useAuthStore((s) => s.user);
  const currentUserId = currentUser?.id;

  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedEvent, setSelectedEvent] = useState<LocalCalendarEvent | ExtendedCalendarEvent | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Attendance data state
  const [attendanceData, setAttendanceData] = useState<AttendanceCalendarDay[]>([]);
  const [, setIsLoadingAttendance] = useState(false);
  const [, setAttendanceError] = useState<string | null>(null);

  // Task events state
  const [taskEvents, setTaskEvents] = useState<LocalCalendarEvent[]>([]);

  // Extended API events state (for detail view)
  const [apiEventsMap, setApiEventsMap] = useState<Record<string, ExtendedCalendarEvent>>({});

  // Meeting form modal state
  const [meetingModalOpen, setMeetingModalOpen] = useState(false);
  const [meetingModalDate, setMeetingModalDate] = useState<string | undefined>();
  const [localMeetings] = useState<MeetingFormData[]>([]);

  // User search modal state
  const [userSearchModalOpen, setUserSearchModalOpen] = useState(false);

  // Create event loading state
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);

  // Handle select user from search
  const handleSelectUser = (userId: string, userName: string) => {
    setViewingUser(userId, userName);
  };

  // Handle create event from MeetingFormModal
  const handleCreateEvent = useCallback(async (data: MeetingFormData) => {
    try {
      setIsCreatingEvent(true);

      // Map MeetingFormData to CreateCalendarEventInput
      const startAt = `${data.date}T${data.startTime}:00.000Z`;
      const endAt = `${data.date}T${data.endTime}:00.000Z`;

      const input = {
        title: data.title,
        description: data.notes || undefined,
        type: "MEETING" as const,
        source: "MEETING" as const,
        startAt,
        endAt,
        timezone: "Asia/Ho_Chi_Minh",
        isAllDay: false,
        visibility: "PRIVATE" as const,
        status: "CONFIRMED" as const,
        attendees: data.participants.map(p => p.name),
        meetingChairman: data.chairman || undefined,
        meetingFormat: data.format,
        meetingLocation: data.location || undefined,
      };

      // Use store's createEvent which handles API call + state update
      const result = await useCalendarStore.getState().createEvent(input);

      if (result) {
        toast.success("Đã thêm lịch họp");
      }
    } catch (error) {
      console.error("Failed to create event:", error);
      toast.error("Không thể thêm lịch. Vui lòng thử lại.");
    } finally {
      setIsCreatingEvent(false);
    }
  }, []);

  // Fetch calendar events from API when month changes
  useEffect(() => {
    void fetchEvents();
  }, [currentYear, currentMonth, mode]);

  // Build extended events map from API events
  useEffect(() => {
    const map: Record<string, ExtendedCalendarEvent> = {};
    apiEvents.forEach((event) => {
      map[event.id] = {
        id: event.id,
        title: event.title,
        date: event.startAt.slice(0, 10),
        type: mapApiEventTypeToLocal(event.type),
        description: event.description ?? undefined,
        time: event.startAt.slice(11, 16),
        startAt: event.startAt,
        endAt: event.endAt,
        meetingFormat: (event.meetingFormat as "offline" | "online") ?? undefined,
        meetingLocation: event.meetingLocation ?? undefined,
        meetingChairman: event.meetingChairman ?? undefined,
        attendees: event.attendees ?? [],
        visibility: event.visibility,
        status: event.status,
        ownerUserId: event.ownerUserId,
      };
    });
    setApiEventsMap(map);
  }, [apiEvents]);

  // Convert API CalendarEvent to LocalCalendarEvent
  const calendarEventsFromApi = useMemo((): LocalCalendarEvent[] => {
    return apiEvents.map((event): LocalCalendarEvent => ({
      id: event.id,
      title: event.title,
      date: event.startAt.slice(0, 10),
      type: mapApiEventTypeToLocal(event.type),
      description: event.description ?? undefined,
      time: event.startAt.slice(11, 16),
    }));
  }, [apiEvents]);

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

    void fetchAttendance();
  }, [currentYear, currentMonth]);

  // Fetch tasks with dueDate in current month range
  useEffect(() => {
    const fetchTaskEvents = async () => {
      try {
        const from = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01`;
        const lastDay = new Date(currentYear, currentMonth + 1, 0).getDate();
        const to = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
        const tasks = await taskApi.getCalendarTasks(from, to);
        const events: LocalCalendarEvent[] = tasks.map((task) => ({
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

  // Calendar type filters — local state for display
  const localFilters = useMemo((): CalendarTypeFilter[] => {
    const defaultFilters: CalendarTypeFilter[] = [
      { type: "meeting", label: "Lịch họp", color: "bg-teal-500", checked: true },
      { type: "personal", label: "Cá nhân", color: "bg-amber-500", checked: true },
      { type: "attendance", label: "Chấm công", color: "bg-emerald-500", checked: true },
    ];
    
    if (filters.types.length === 0) return defaultFilters;
    
    return defaultFilters.map(f => ({
      ...f,
      checked: filters.types.some(t => t.toLowerCase() === f.type || mapLocalTypeToApi(t) === f.type),
    }));
  }, [filters]);

  const handleFilterChange = (type: EventType) => {
    const currentTypes = filters.types.length > 0 
      ? filters.types 
      : ["meeting", "personal", "attendance"] as EventType[];
    
    const newTypes = currentTypes.includes(type)
      ? currentTypes.filter(t => t !== type)
      : [...currentTypes, type];
    
    setFilters(newTypes);
  };

  // Generate events for current year, merged with task events and API events
  const allEvents = useMemo(
    () => [...getCalendarEvents(currentYear), ...taskEvents, ...calendarEventsFromApi],
    [currentYear, taskEvents, calendarEventsFromApi],
  );

  // Filter events based on selected filters
  const filteredEvents = useMemo(() => {
    const activeTypes = localFilters.filter((f) => f.checked).map((f) => f.type);
    return allEvents.filter((event) => activeTypes.includes(event.type));
  }, [allEvents, localFilters]);

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

  // Handle event click — navigate to /tasks for task events, open modal otherwise
  const handleEventClick = useCallback(
    (event: LocalCalendarEvent) => {
      if (event.type === "task" && event.taskId) {
        navigate(`/tasks?taskId=${event.taskId}`);
      } else {
        // Get extended event data if available
        const extended = apiEventsMap[event.id];
        setSelectedEvent(extended ?? event);
      }
    },
    [navigate, apiEventsMap]
  );

  // Handle edit event
  const handleEditEvent = useCallback(() => {
    // TODO: Open meeting form modal with event data pre-filled
    toast.info("Chỉnh sửa sự kiện - tính năng đang phát triển");
    setSelectedEvent(null);
  }, []);

  // Handle delete event
  const handleDeleteEvent = useCallback(async () => {
    if (!selectedEvent) return;

    try {
      const success = await deleteEvent(selectedEvent.id);
      if (success) {
        setSelectedEvent(null);
        // Refresh events
        await fetchEvents();
      }
    } catch (error) {
      console.error("Failed to delete event:", error);
    }
  }, [selectedEvent, deleteEvent, fetchEvents]);

  // Toggle filter
  const toggleFilter = useCallback((type: EventType) => {
    handleFilterChange(type);
  }, [handleFilterChange]);

  // Check if attendance filter is active
  const isAttendanceFilterActive = localFilters.find(f => f.type === "attendance")?.checked ?? true;

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
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-[#1976D2]/60 focus:outline-none focus:ring-2 focus:ring-[#1976D2]/15"
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

            {/* Calendar mode selector */}
            <div className="mb-4">
              <h3 className="mb-2 text-sm font-semibold text-text-primary">
                Chế độ xem
              </h3>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => useCalendarStore.getState().setMode("my")}
                  className={clsx(
                    "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm transition-micro",
                    mode === "my"
                      ? "bg-primary/10 text-primary"
                      : "text-text-secondary hover:bg-surface-hover"
                  )}
                >
                  <CalendarIcon className="h-4 w-4" />
                  Lịch của tôi
                </button>
                <button
                  type="button"
                  onClick={() => setUserSearchModalOpen(true)}
                  className={clsx(
                    "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm transition-micro",
                    mode === "other"
                      ? "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
                      : "text-text-secondary hover:bg-surface-hover"
                  )}
                >
                  <UserIcon className="h-4 w-4" />
                  {mode === "other" && viewingUserName ? viewingUserName : "Xem lịch người khác"}
                </button>
                <button
                  type="button"
                  onClick={() => toast.info("Tính năng đang phát triển")}
                  className={clsx(
                    "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm transition-micro",
                    mode === "unit"
                      ? "bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400"
                      : "text-text-secondary hover:bg-surface-hover"
                  )}
                >
                  <BuildingOfficeIcon className="h-4 w-4" />
                  {mode === "unit" && viewingUnitName ? viewingUnitName : "Lịch đơn vị"}
                </button>
              </div>
            </div>

            {/* Calendar types */}
            <div className="mb-4">
              <h3 className="mb-2 text-sm font-semibold text-text-primary">
                Lịch của tôi
              </h3>
              <div className="space-y-2">
                {localFilters.map((filter) => (
                  <label
                    key={filter.type}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-hover transition-micro"
                  >
                    <input
                      type="checkbox"
                      checked={filter.checked}
                      onChange={() => toggleFilter(filter.type)}
                      className="h-4 w-4 rounded border-border accent-[#1565C0] focus:ring-2 focus:ring-[#1976D2]/30"
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
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface px-3 py-2 text-sm font-medium text-text-secondary hover:border-[#1976D2]/60 hover:bg-[#1565C0]/5 hover:text-[#1565C0] transition-micro"
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
                  className="rounded-xl bg-gradient-to-r from-[#1976D2] to-[#1565C0] px-4 py-1.5 text-sm font-medium text-white hover:brightness-105 active:scale-95 shadow-sm shadow-[#1565C0]/25 transition-micro"
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
                    onClick={() => setView(view.id)}
                    className={clsx(
                      "rounded-md px-3 py-1.5 text-sm font-medium transition-micro",
                      currentView === view.id
                        ? "bg-gradient-to-r from-[#1976D2] to-[#1565C0] text-white shadow-sm"
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
                            isToday(dayInfo.date) && "bg-[#1565C0] text-white font-semibold"
                          )}
                        >
                          {dayInfo.date.getDate()}
                        </span>
                      </div>

                      {/* Attendance badge */}
                      {attendance && isAttendanceFilterActive && (
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
                            className="block w-full px-1.5 py-0.5 text-xs font-medium text-text-muted hover:text-[#1565C0] transition-micro"
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

          {/* Day view */}
          {currentView === "day" && (
            <DayView
              date={selectedDate}
              events={searchedEvents}
              attendance={getAttendanceForDate(selectedDate)}
              onEventClick={handleEventClick}
            />
          )}

          {/* Week view */}
          {currentView === "week" && (
            <WeekView
              year={currentYear}
              month={currentMonth}
              events={searchedEvents}
              attendanceData={attendanceData}
              onDateClick={handleDateClick}
              onEventClick={handleEventClick}
              isToday={isToday}
              isSelected={isSelected}
            />
          )}
        </div>
      </div>

      {/* Event detail modal */}
      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          currentUserId={currentUserId}
          onClose={() => setSelectedEvent(null)}
          onEdit={handleEditEvent}
          onDelete={handleDeleteEvent}
        />
      )}

      {/* Meeting form modal */}
      <MeetingFormModal
        isOpen={meetingModalOpen}
        onClose={() => setMeetingModalOpen(false)}
        onSave={handleCreateEvent}
        defaultDate={meetingModalDate}
        existingMeetings={localMeetings}
        isLoading={isCreatingEvent}
      />

      {/* User search modal */}
      <UserSearchModal
        isOpen={userSearchModalOpen}
        onClose={() => setUserSearchModalOpen(false)}
        onSelectUser={handleSelectUser}
      />

    </div>
  );
};

/**
 * Map API CalendarEventType (UPPERCASE) to local EventType (lowercase_underscore).
 */
const mapApiEventTypeToLocal = (apiType: string): EventType => {
  switch (apiType) {
    case "PERSONAL":
      return "personal";
    case "MEETING":
      return "meeting";
    case "ATTENDANCE":
      return "attendance";
    case "TASK":
      return "task";
    case "UNIT":
    case "LEADER":
    case "WORK":
      return "work";
    default:
      return "personal";
  }
};

/**
 * Map local EventType to API CalendarEventType.
 */
const mapLocalTypeToApi = (localType: string): string => {
  switch (localType) {
    case "personal":
      return "PERSONAL";
    case "meeting":
      return "MEETING";
    case "attendance":
      return "ATTENDANCE";
    case "task":
      return "TASK";
    case "work":
    case "unit":
    case "leader":
      return "WORK";
    default:
      return "PERSONAL";
  }
};

export default CalendarPage;
