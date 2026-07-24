import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
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
  UsersIcon,
  EyeIcon,
} from "@heroicons/react/24/outline";
import {
  getEventColor,
  VIETNAMESE_MONTHS,
  VIETNAMESE_WEEKDAYS,
  type CalendarEvent as LocalCalendarEvent,
  type ExtendedCalendarEvent,
  type EventType,
} from "../data/calendarEvents";
import { EventDetailModal } from "../components/EventDetailModal";
import { useCalendarEventMutations } from "../hooks/useCalendarEventMutations";
import {
  hrApi,
  type AttendanceCalendarDay,
} from "../../api/hrApi";
import {
  type HRCalendarEvent,
  type CalendarAttachmentDto,
} from "../../api/hrCalendarApi";
import { apiVisibilityToForm } from "../utils/calendarVisibility";
import { MeetingFormModal, type MeetingFormData } from "../../../components/ui/MeetingFormModal";
import { PersonalEventFormModal, type PersonalEventFormData } from "../../../components/ui/PersonalEventFormModal";
import { ConfirmDialog, Modal } from "../../../components/ui/Modal";
import { toast } from "../../../utils/toast";
import { useCalendarStore } from "../../../stores/calendarStore";
import { DayView } from "../components/DayView";
import { WeekView } from "../components/WeekView";
import { getWeekDays, getIsoWeekNumber, eventOccursOnDay, getMultiDayPosition, type MultiDayPosition } from "../utils/timeline";
import {
  buildExtendedEventMap,
  filterCalendarEventsByType,
  getMeetingMetadata,
  mapHrmEventToCalendarEvent,
  remoteAttachmentsToForm,
  toLocalDateString,
  toLocalTimeString,
} from "../utils/calendarEventMapping";
import { HrNotificationBell } from "../components/HrNotificationBell";
import { UserSearchModal } from "../../../components/ui/UserSearchModal";
import { loadUserProfiles } from "../../../services/userBatchLoader";
import {
  resolvePublicResourceUrl,
  CALENDAR_ATTACHMENTS_USE_MOCK,
} from "../../../config";
import { mockGetAttachmentsForEvents } from "../utils/calendarAttachmentMockStore";

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
 * Khoảng FETCH cho tháng đang xem, LÙI 6 THÁNG ở đầu và TIẾN 1 THÁNG ở cuối.
 * Lý do: lịch dài hạn (công tác/nghỉ phép có thể kéo dài 3–4 tháng) bắt đầu từ
 * nhiều tháng trước nhưng vẫn kéo sang tuần/tháng đang xem; backend lọc theo
 * `startAt` nên nếu range quá hẹp sẽ KHÔNG trả các event dài bắt đầu xa → dây bị
 * đứt ở các tuần xa ngày bắt đầu. Lùi 6 tháng để chắc bắt được event dài.
 * Lưới/Day/Week vẫn lọc client theo eventOccursOnDay nên chỉ hiển thị đúng phạm
 * vi đang xem. Khớp với khoảng fetch của widget lịch tuần (EmptyState).
 */
const getMonthFetchRange = (year: number, month: number): { from: string; to: string } => {
  const start = new Date(year, month - 6, 1);
  const end = new Date(year, month + 2, 0);
  return { from: formatDateString(start), to: formatDateString(end) };
};

/**
 * Format time from HH:mm format
 */
const formatTime = (time: string | null | undefined): string => {
  if (!time) return "--:--";
  return time;
};


/**
 * Mini calendar component for the sidebar.
 */
const MiniCalendar: React.FC<{
  year: number;
  month: number;
  onNavigate: (year: number, month: number) => void;
  onSelectDate: (date: Date) => void;
  selectedDate: Date;
}> = ({ year, month, onNavigate, onSelectDate, selectedDate }) => {
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
            onClick={() => onSelectDate(dayInfo.date)}
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
  /** Vị trí trong dải trải khi là lịch nhiều ngày (render thanh trải ngang). */
  spanPosition?: MultiDayPosition | null;
}> = ({ event, onClick, compact = false, spanPosition = null }) => {
  // Lịch dài ngày → thanh TRẢI NGANG: ngày bắt đầu hiện tiêu đề, ngày giữa chỉ
  // là dây nối, ngày kết thúc tô đỏ (#DC2626). Margin âm để bar lấn vào padding
  // ô (p-1.5), nối liền thành dây qua các ngày.
  if (spanPosition) {
    const isEnd = spanPosition === "end";
    const isStart = spanPosition === "start";
    // Ngày GIỮA: chỉ một sợi chỉ mảnh căn giữa, nối liền hai badge to.
    if (!isStart && !isEnd) {
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClick(event);
          }}
          title={event.title}
          className="-mx-1.5 flex h-5 w-full cursor-pointer items-center"
        >
          <span className="h-1 w-full bg-amber-400/80" />
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick(event);
        }}
        title={isEnd ? `${event.title} · Kết thúc` : event.title}
        className={clsx(
          "relative flex h-5 w-full cursor-pointer items-center text-left text-xs font-semibold transition-micro hover:brightness-95 dark:hover:brightness-110",
          isStart && "-mr-1.5 rounded-l pl-1.5",
          isEnd && "-ml-1.5 rounded-r pl-1.5",
          isEnd ? "bg-[#DC2626] text-white" : "bg-amber-400/80 text-amber-900 dark:text-amber-100",
        )}
      >
        {isStart && <span className="truncate">{event.title}</span>}
        {isEnd && <span className="truncate">Kết thúc</span>}
        {/* Node tròn ở đầu/cuối dây để nhìn rõ là một liên kết. */}
        <span
          className={clsx(
            "pointer-events-none absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-amber-500",
            isStart ? "right-0 translate-x-1/2" : "left-0 -translate-x-1/2",
          )}
        />
      </button>
    );
  }

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
        compact ? "px-1.5 py-0.5" : "px-2 py-1",
        "text-xs",
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

interface MonthGridDay {
  date: Date;
  isCurrentMonth: boolean;
}

/**
 * Lưới lịch tháng (35 ô) — tách khỏi CalendarPage + memo hoá để mỗi lần mở/đóng
 * modal (state ở CalendarPage) KHÔNG re-render + re-filter lại toàn bộ ô. Việc
 * lọc/sắp event theo từng ngày gom vào 1 useMemo (chạy khi data đổi, không phải
 * mỗi render). Props đều stable (useCallback/useMemo ở parent).
 */
const MonthGrid: React.FC<{
  calendarDays: MonthGridDay[];
  events: (LocalCalendarEvent | ExtendedCalendarEvent)[];
  getAttendanceForDate: (date: Date) => AttendanceCalendarDay | undefined;
  isToday: (date: Date) => boolean;
  isSelected: (date: Date) => boolean;
  isAttendanceFilterActive: boolean;
  showAttendance: boolean;
  onOpenDay: (date: Date) => void;
  onEventClick: (event: LocalCalendarEvent | ExtendedCalendarEvent) => void;
}> = React.memo(
  ({
    calendarDays,
    events,
    getAttendanceForDate,
    isToday,
    isSelected,
    isAttendanceFilterActive,
    showAttendance,
    onOpenDay,
    onEventClick,
  }) => {
    // Lọc + sắp event cho từng ô 1 lần / khi data đổi (thay vì mỗi render × mỗi ô).
    const perDay = useMemo(
      () =>
        calendarDays.map((dayInfo) => {
          const dayEvents = events
            .filter((event) => eventOccursOnDay(event, dayInfo.date))
            .slice()
            .sort((a, b) => {
              const aSpan = getMultiDayPosition(a, dayInfo.date) !== null;
              const bSpan = getMultiDayPosition(b, dayInfo.date) !== null;
              if (aSpan !== bSpan) return aSpan ? -1 : 1;
              return (a.time ?? "").localeCompare(b.time ?? "");
            });
          return { dayInfo, dayEvents };
        }),
      [calendarDays, events],
    );

    return (
      <div className="flex-1 overflow-auto p-4">
        {/* Weekday headers */}
        <div className="mb-2 grid grid-cols-7 gap-px">
          {VIETNAMESE_WEEKDAYS.map((day, index) => (
            <div
              key={day}
              className={clsx(
                "py-2 text-center text-sm font-medium",
                index === 0 ? "text-rose-500 dark:text-rose-400" : "text-text-secondary",
              )}
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar days grid */}
        <div className="grid grid-cols-7 gap-px rounded-lg border border-border bg-surface">
          {perDay.map(({ dayInfo, dayEvents }, index) => {
            const maxVisibleEvents = 2;
            const visibleEvents = dayEvents.slice(0, maxVisibleEvents);
            const remainingCount = dayEvents.length - maxVisibleEvents;
            const attendance = getAttendanceForDate(dayInfo.date);

            return (
              <div
                key={index}
                onClick={() => onOpenDay(dayInfo.date)}
                title="Mở lịch ngày"
                className={clsx(
                  "min-h-[120px] cursor-pointer border-border bg-surface p-1.5 transition-micro",
                  !dayInfo.isCurrentMonth && "bg-surface-overlay",
                  dayInfo.isCurrentMonth && !isToday(dayInfo.date) && "hover:bg-surface-hover",
                  isSelected(dayInfo.date) &&
                    !isToday(dayInfo.date) &&
                    "ring-1 ring-border-strong ring-inset",
                )}
              >
                {/* Date number */}
                <div className="mb-1 flex items-center justify-between">
                  <span
                    className={clsx(
                      "flex h-7 w-7 items-center justify-center rounded-full text-sm",
                      !dayInfo.isCurrentMonth && "text-text-disabled",
                      dayInfo.isCurrentMonth && !isToday(dayInfo.date) && "text-text-primary",
                      isToday(dayInfo.date) && "bg-[#1565C0] text-white font-semibold",
                    )}
                  >
                    {dayInfo.date.getDate()}
                  </span>
                </div>

                {/* Attendance badge — only show for own calendar */}
                {attendance && isAttendanceFilterActive && showAttendance && (
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
                      onClick={onEventClick}
                      compact
                      spanPosition={getMultiDayPosition(event, dayInfo.date)}
                    />
                  ))}
                  {remainingCount > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenDay(dayInfo.date);
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
    );
  },
);

/**
 * Calendar page component.
 */
export const CalendarPage: React.FC = () => {
  const today = new Date();

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
    isLoading: storeLoading,
  } = storeState;

  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedEvent, setSelectedEvent] = useState<LocalCalendarEvent | ExtendedCalendarEvent | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Khi navigate từ widget lịch tuần với state { openEventId, openEventSource, view }
  const location = useLocation();
  const handledNavState = useRef(false);
  const [pendingOpenEventId, setPendingOpenEventId] = useState<string | null>(null);

  // Attendance data state. (Loading/error state đã bỏ: giá trị chưa từng được
  // render — chỉ giữ data + log lỗi ra console cho dev.)
  const [attendanceData, setAttendanceData] = useState<AttendanceCalendarDay[]>([]);


  // Meeting form modal state
  const [meetingModalOpen, setMeetingModalOpen] = useState(false);
  const [meetingModalDate, setMeetingModalDate] = useState<string | undefined>();
  const [meetingModalStart, setMeetingModalStart] = useState<string | undefined>();
  const [meetingModalEnd, setMeetingModalEnd] = useState<string | undefined>();

  // "Thêm lịch" type chooser — họp vs cá nhân. Giữ lại ngày/giờ điền sẵn để
  // chuyển sang đúng form sau khi user chọn loại.
  const [eventTypeChooserOpen, setEventTypeChooserOpen] = useState(false);

  // Personal event form modal state
  const [personalModalOpen, setPersonalModalOpen] = useState(false);
  const [personalModalDate, setPersonalModalDate] = useState<string | undefined>();
  const [personalModalStart, setPersonalModalStart] = useState<string | undefined>();
  const [personalModalEnd, setPersonalModalEnd] = useState<string | undefined>();

  // Edit event modal state
  const [editingEvent, setEditingEvent] = useState<MeetingFormData | null>(null);

  // Edit personal event modal state — lịch cá nhân sửa bằng form cá nhân, không
  // phải form họp (xem handleEditEvent: nhánh theo type).
  const [editingPersonalEvent, setEditingPersonalEvent] = useState<PersonalEventFormData | null>(null);

  // Delete confirmation dialog state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // User search modal state
  const [userSearchModalOpen, setUserSearchModalOpen] = useState(false);

  // Create event loading state
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);

  // Handle select user from search
  const handleSelectUser = (userId: string, userName: string) => {
    setViewingUser(userId, userName);
  };

  // Đọc navigation state từ widget lịch tuần: đặt view theo yêu cầu (mặc định
  // "week" khi mở kèm event) và mở event nếu có openEventId. "Xem lịch đầy đủ →"
  // gửi { view: "month" } (không kèm event) → chỉ đổi sang view Tháng.
  // Effect hợp lệ: react theo location.state (router). set-state đồng bộ là chủ ý
  // (one-shot, guard bằng handledNavState) → theo convention repo, disable rule.
  useEffect(() => {
    if (handledNavState.current) return;
    const navState = location.state as { openEventId?: string; view?: CalendarView } | null;
    if (!navState?.openEventId && !navState?.view) return;
    handledNavState.current = true;
    if (navState.view) {
      setView(navState.view);
    } else if (navState.openEventId) {
      setView("week");
    }
    if (navState.openEventId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPendingOpenEventId(navState.openEventId);
    }
    // Clear state khỏi history để back/refresh không mở lại
    window.history.replaceState({}, "");
  }, [location.state, setView]);

  // Khi apiEvents đã load và còn pending event id → tìm và mở. Effect hợp lệ:
  // react theo data async về (không phải derive thuần).
  useEffect(() => {
    if (!pendingOpenEventId || !apiEvents.length) return;
    const match = apiEvents.find((e) => e.id === pendingOpenEventId);
    if (match) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedEvent(mapHrmEventToCalendarEvent(match));
      setPendingOpenEventId(null);
    }
  }, [pendingOpenEventId, apiEvents]);

  // Quay về "Lịch của tôi" ngay tại chỗ (không cần reload trang).
  // setMode tự gọi fetchEvents() theo currentMonth của STORE — vốn không đồng bộ
  // với tháng đang xem của TRANG, gây load nhầm range. Đồng bộ range vào store
  // trước (setDate không fetch) rồi mới setMode để fetch đúng tháng đang xem.
  const handleBackToMyCalendar = useCallback(() => {
    const store = useCalendarStore.getState();
    store.setDate(currentYear, currentMonth);
    store.setMode("my");
  }, [currentYear, currentMonth]);

  // Refetch theo đúng tháng đang xem của TRANG (store có thể giữ tháng khác)
  const refetchCurrentMonth = useCallback(() => {
    const { from, to } = getMonthFetchRange(currentYear, currentMonth);
    void fetchEvents(from, to);
  }, [currentYear, currentMonth, fetchEvents]);

  // Nghiệp vụ ghi lịch dùng CHUNG hook với WeeklyCalendarWidget (tạo/sửa/xóa/
  // phản hồi) — một nguồn logic duy nhất, không nhân đôi.
  const mutations = useCalendarEventMutations({ onSuccess: refetchCurrentMonth });

  // Tạo lịch họp — nghiệp vụ nằm trong useCalendarEventMutations (dùng chung
  // widget); ở đây chỉ quản lý cờ loading của trang.
  const handleCreateEvent = useCallback(async (data: MeetingFormData) => {
    setIsCreatingEvent(true);
    try {
      await mutations.createMeeting(data);
    } finally {
      setIsCreatingEvent(false);
    }
  }, [mutations]);

  // Tạo lịch cá nhân (eventType PERSONAL, không người tham gia/chủ trì).
  const handleCreatePersonalEvent = useCallback(async (data: PersonalEventFormData) => {
    setIsCreatingEvent(true);
    try {
      await mutations.createPersonal(data);
    } finally {
      setIsCreatingEvent(false);
    }
  }, [mutations]);

  // Mở bộ chọn loại lịch (họp / cá nhân) với ngày + giờ điền sẵn.
  const openEventTypeChooser = useCallback(
    (date?: string, start?: string, end?: string) => {
      setMeetingModalDate(date);
      setMeetingModalStart(start);
      setMeetingModalEnd(end);
      setPersonalModalDate(date);
      setPersonalModalStart(start);
      setPersonalModalEnd(end);
      setEventTypeChooserOpen(true);
    },
    [],
  );

  // Fetch calendar events from API when month changes or mode changes.
  // Always pass explicit date range from component state so the store doesn't
  // use its own (potentially stale) currentYear/currentMonth.
  useEffect(() => {
    const { from, to } = getMonthFetchRange(currentYear, currentMonth);
    void fetchEvents(from, to);
  }, [currentYear, currentMonth, mode]);

  // Extended events map cho detail view — thuần derive từ apiEvents → useMemo
  // (trước là effect+setState gây cascading render + chặn React Compiler).
  const apiEventsMap = useMemo(() => buildExtendedEventMap(apiEvents), [apiEvents]);

  // Lịch họp đã tải trong tháng → dùng cho check trùng giờ khi tag người tham gia.
  // Chỉ phát hiện trùng trong phạm vi event mình thấy được (sở hữu / được mời).
  const meetingsForConflictCheck = useMemo((): MeetingFormData[] => {
    return apiEvents.map((event: HRCalendarEvent): MeetingFormData => {
      const meta = getMeetingMetadata(event);
      const participantNames = event.participants
        .map((p) => p.fullName ?? p.employee?.fullName ?? "")
        .filter(Boolean)
        .map((name) => ({ name }));
      const ownerName = event.ownerName ?? event.owner?.fullName;
      if (ownerName) participantNames.push({ name: ownerName });
      return {
        id: event.id,
        title: event.title,
        date: toLocalDateString(event.startAt),
        startTime: toLocalTimeString(event.startAt),
        endTime: toLocalTimeString(event.endAt),
        chairman: meta.meetingChairman ?? "",
        participants: participantNames,
        format: meta.meetingFormat === "online" ? "online" : "offline",
        visibility: apiVisibilityToForm(event.visibility),
        location: event.location ?? "",
        notes: "",
        attachments: [],
      };
    });
  }, [apiEvents]);

  // Convert API CalendarEvent to ExtendedCalendarEvent (giữ startAt/endAt để
  // Day/Week View dựng block theo thời lượng + overlap — xem utils/timeline.ts).
  const calendarEventsFromApi = useMemo((): ExtendedCalendarEvent[] => {
    return apiEvents.map(mapHrmEventToCalendarEvent);
  }, [apiEvents]);

  // MOCK attachments (khi BE chưa trả `attachments[]`): nạp từ IndexedDB theo
  // eventId để viewer + form sửa hiển thị lại. No-op khi nối BE thật.
  const [mockAttachmentsByEventId, setMockAttachmentsByEventId] = useState<
    Record<string, CalendarAttachmentDto[]>
  >({});
  useEffect(() => {
    if (!CALENDAR_ATTACHMENTS_USE_MOCK || apiEvents.length === 0) return;
    let cancelled = false;
    void mockGetAttachmentsForEvents(apiEvents.map((e) => e.id)).then((map) => {
      if (!cancelled) setMockAttachmentsByEventId(map);
    });
    return () => {
      cancelled = true;
    };
  }, [apiEvents]);

  // Avatar người tham gia lấy từ chat-web (/users/batch, GIỐNG Poll) bằng authUserId —
  // không phụ thuộc hr-api. Batch-load 1 lần cho mọi participant đang hiển thị.
  const [participantAvatars, setParticipantAvatars] = useState<Record<string, string | null>>({});
  useEffect(() => {
    const ids = [
      ...new Set(
        calendarEventsFromApi.flatMap((e) =>
          (e.attendeeAvatars ?? [])
            .map((a) => a.userId)
            .filter((id): id is string => !!id),
        ),
      ),
    ];
    if (ids.length === 0) return;
    void loadUserProfiles(ids).then((results) => {
      setParticipantAvatars((prev) => {
        const next = { ...prev };
        for (const [id, s] of Object.entries(results)) {
          next[id] =
            resolvePublicResourceUrl(
              (s as { avatar?: string })?.avatar || s?.avatarUrl || undefined,
            ) ?? null;
        }
        return next;
      });
    });
  }, [calendarEventsFromApi]);

  // Tiêm avatar đã resolve (chat-web) vào event trước khi đẩy xuống Day/Week/Widget.
  const calendarEventsWithAvatars = useMemo((): ExtendedCalendarEvent[] => {
    if (Object.keys(participantAvatars).length === 0) return calendarEventsFromApi;
    return calendarEventsFromApi.map((e) =>
      e.attendeeAvatars?.length
        ? {
            ...e,
            attendeeAvatars: e.attendeeAvatars.map((a) =>
              a.userId && participantAvatars[a.userId]
                ? { ...a, avatarUrl: participantAvatars[a.userId] }
                : a,
            ),
          }
        : e,
    );
  }, [calendarEventsFromApi, participantAvatars]);

  // Fetch attendance data when month changes.
  // Skip when viewing another user's calendar — never show current user's attendance
  // alongside someone else's events. A future phase can fetch target user's attendance here.
  useEffect(() => {
    // Xem lịch người khác → không hiển thị chấm công của mình. Clear nằm trong
    // async fn (không set-state đồng bộ trong effect body → tránh cascading render).
    const fetchAttendance = async () => {
      if (mode === "other") {
        setAttendanceData([]);
        return;
      }
      try {
        const fromDate = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01`;
        const toDate = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${new Date(currentYear, currentMonth + 1, 0).getDate().toString().padStart(2, "0")}`;

        const data = await hrApi.getMyAttendanceCalendar({ from: fromDate, to: toDate });
        // reason EMPLOYEE_NOT_LINKED / NO_ATTENDANCE_DATA → items rỗng → lịch trống (không có badge).
        setAttendanceData(data.items ?? []);
      } catch (error: unknown) {
        console.error("Failed to fetch attendance:", error);
        setAttendanceData([]);
      }
    };

    void fetchAttendance();
  }, [currentYear, currentMonth, mode]);

  // Calendar type filters — local state for display
  const localFilters = useMemo((): CalendarTypeFilter[] => {
    const defaultFilters: CalendarTypeFilter[] = [
      { type: "meeting", label: "Lịch họp", color: "bg-teal-500", checked: true },
      { type: "personal", label: "Cá nhân", color: "bg-amber-500", checked: true },
      { type: "attendance", label: "Chấm công", color: "bg-emerald-500", checked: false },
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
      : ["meeting", "personal"] as EventType[];
    
    const newTypes = currentTypes.includes(type)
      ? currentTypes.filter(t => t !== type)
      : [...currentTypes, type];
    
    setFilters(newTypes);
  };

  // Calendar chỉ hiển thị sự kiện từ API (họp/cá nhân…); không còn nhiệm vụ & ngày lễ.
  const allEvents = calendarEventsWithAvatars;

  // Filter events based on selected filters.
  // knownTypes = đúng những loại CÓ checkbox; loại khác (vd "task") không có ô để
  // tick nên phải hiện mặc định, không được lọc mất.
  const filteredEvents = useMemo(() => {
    const activeTypes = localFilters.filter((f) => f.checked).map((f) => f.type);
    const knownTypes = localFilters.map((f) => f.type);
    return filterCalendarEventsByType(allEvents, activeTypes, knownTypes);
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

  // Handlers thuần set-state: KHÔNG useCallback thủ công — để React Compiler tự
  // memo (deps thủ công lệch deps compiler suy ra → nó bỏ optimize cả component).
  const goToPrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentYear((y) => y - 1);
      setCurrentMonth(11);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const goToNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentYear((y) => y + 1);
      setCurrentMonth(0);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const goToToday = () => {
    const now = new Date();
    setCurrentYear(now.getFullYear());
    setCurrentMonth(now.getMonth());
    setSelectedDate(now);
  };

  // Dịch ngày đang chọn (day/week view) ±deltaDays, đồng bộ tháng/năm để refetch
  // đúng range (event của tháng kề tại biên tuần là giới hạn Phase 1).
  const shiftSelected = (deltaDays: number) => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + deltaDays);
    setSelectedDate(next);
    setCurrentYear(next.getFullYear());
    setCurrentMonth(next.getMonth());
  };

  // Nhãn tiêu đề theo chế độ xem.
  const dayTitle = useMemo(() => {
    const wd = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];
    return `${wd[selectedDate.getDay()]}, ${selectedDate.getDate()}/${selectedDate.getMonth() + 1}/${selectedDate.getFullYear()}`;
  }, [selectedDate]);

  const weekTitle = useMemo(() => {
    const days = getWeekDays(selectedDate);
    const start = days[0];
    const end = days[6];
    const fmt = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
    return `Tuần ${getIsoWeekNumber(selectedDate)} · ${fmt(start)}–${fmt(end)}/${end.getFullYear()}`;
  }, [selectedDate]);

  // Handle mini calendar navigation
  const handleMiniCalendarNavigate = (year: number, month: number) => {
    setCurrentYear(year);
    setCurrentMonth(month);
    setSelectedDate(new Date(year, month, 1));
  };

  // Handle date selection — đồng bộ tháng/năm để ngày của tháng kề (ô mờ trong
  // lưới tháng) chuyển đúng tháng khi chọn, không chỉ set selectedDate.
  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    setCurrentYear(date.getFullYear());
    setCurrentMonth(date.getMonth());
  };

  // Mở Day view của một ngày (click ô ngày trong lưới Tháng / tiêu đề ngày Tuần).
  const handleOpenDay = (date: Date) => {
    handleDateClick(date);
    setView("day");
  };

  // Click ô khung giờ trên lưới Day/Week → mở form tạo lịch với giờ điền sẵn,
  // snap về mốc 30 phút (kiểu Teams), thời lượng mặc định 30 phút.
  const handleCreateAtSlot = useCallback(
    (date: Date, minutes: number) => {
      if (mode === "other") return; // xem lịch người khác → không tạo
      const fmt = (m: number) =>
        `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      const snapped = Math.max(0, Math.min(Math.floor(minutes / 30) * 30, 23 * 60 + 30));
      const endM = snapped + 30;
      openEventTypeChooser(
        formatDateString(date),
        fmt(snapped),
        endM >= 24 * 60 ? "23:59" : fmt(endM),
      );
    },
    [mode, openEventTypeChooser],
  );

  // Handle event click — open detail modal (extended data if available)
  const handleEventClick = useCallback(
    (event: LocalCalendarEvent) => {
      const extended = apiEventsMap[event.id];
      setSelectedEvent(extended ?? event);
    },
    [apiEventsMap]
  );

  // `selectedEvent` là SNAPSHOT lúc bấm. Sau khi Cập nhật, list refetch và
  // apiEventsMap dựng lại, nhưng snapshot thì không → modal chi tiết vẫn hiện dữ
  // liệu cũ (tiêu đề/giờ/địa điểm/chủ trì). Luôn đọc bản mới nhất theo id, chỉ rơi
  // về snapshot khi event không còn trong map (vd lịch chấm công/ngày lễ tĩnh).
  const selectedEventLive = useMemo(() => {
    if (!selectedEvent) return null;
    return apiEventsMap[selectedEvent.id] ?? selectedEvent;
  }, [selectedEvent, apiEventsMap]);

  // Raw HR event for the selected item — carries participant roster + response.
  const selectedHrEvent = useMemo(() => {
    if (!selectedEvent) return undefined;
    const found = apiEvents.find((e) => e.id === selectedEvent.id);
    if (!found) return undefined;
    // MOCK: overlay attachments từ IndexedDB nếu BE chưa trả (found.attachments rỗng).
    const mockAtts = mockAttachmentsByEventId[found.id];
    if (mockAtts && (!found.attachments || found.attachments.length === 0)) {
      return { ...found, attachments: mockAtts };
    }
    return found;
  }, [selectedEvent, apiEvents, mockAttachmentsByEventId]);

  // Handle edit event — open MeetingFormModal with pre-filled data
  const handleEditEvent = useCallback(() => {
    // Dùng bản live (không phải snapshot) để form Sửa prefill đúng dữ liệu mới nhất
    // sau lần Cập nhật trước đó.
    if (!selectedEventLive) return;

    // Check if viewing others — don't allow edit
    if (mode === "other") {
      toast.warning("Bạn không có quyền chỉnh sửa sự kiện này.");
      return;
    }

    // Check if current user has edit permission (from API)
    const extended = apiEventsMap[selectedEventLive.id];
    if (extended && extended.canEdit === false) {
      toast.warning("Bạn không có quyền chỉnh sửa sự kiện này.");
      return;
    }

    // Check if it's an extended event with startAt/endAt
    const isExtended = "startAt" in selectedEventLive && selectedEventLive.startAt;

    // Only allow editing API events (with startAt/endAt)
    if (!isExtended) {
      toast.warning("Chỉ có thể chỉnh sửa lịch tạo từ hệ thống");
      return;
    }

    const extEvent = selectedEventLive as ExtendedCalendarEvent;

    // Lịch cá nhân (type "personal") → mở form cá nhân, không phải form họp.
    if (extEvent.type === "personal") {
      const personalStartDate = extEvent.startAt
        ? toLocalDateString(extEvent.startAt)
        : formatDateString(new Date());
      const personalData: PersonalEventFormData = {
        id: extEvent.id,
        title: extEvent.title,
        date: personalStartDate,
        // endAt có thể rơi vào ngày khác (qua đêm / nhiều ngày) → lấy ngày local của endAt.
        endDate: extEvent.endAt ? toLocalDateString(extEvent.endAt) : personalStartDate,
        startTime: extEvent.startAt ? toLocalTimeString(extEvent.startAt) : "08:00",
        endTime: extEvent.endAt ? toLocalTimeString(extEvent.endAt) : "09:00",
        notes: extEvent.description || "",
        visibility: apiVisibilityToForm(selectedHrEvent?.visibility ?? extEvent.visibility),
        attachments: remoteAttachmentsToForm(selectedHrEvent?.attachments),
      };
      setEditingPersonalEvent(personalData);
      return;
    }

    const meta = getMeetingMetadata(selectedHrEvent);

    // Người tham gia: ưu tiên roster HR (giữ employeeId để update giữ nguyên
    // liên kết); kèm khách mời free-text từ metadata. Fallback tên hiển thị.
    const participants: MeetingFormData["participants"] = selectedHrEvent
      ? [
          ...selectedHrEvent.participants.map((p) => ({
            name: p.fullName ?? p.employee?.fullName ?? p.employeeCode ?? "N/A",
            employeeId: p.employeeId,
            employeeCode: p.employeeCode ?? p.employee?.employeeCode ?? undefined,
            userId: p.authUserId ?? undefined,
          })),
          ...(meta.attendees ?? []).map((name) => ({ name })),
        ]
      : (extEvent.attendees || []).map((name) => ({ name }));

    // Build MeetingFormData from HR event (+ metadata) / ExtendedCalendarEvent
    const data: MeetingFormData = {
      id: extEvent.id,
      title: extEvent.title,
      date: extEvent.startAt ? toLocalDateString(extEvent.startAt) : formatDateString(new Date()),
      startTime: extEvent.startAt ? toLocalTimeString(extEvent.startAt) : "08:00",
      endTime: extEvent.endAt ? toLocalTimeString(extEvent.endAt) : "09:00",
      chairman: meta.meetingChairman ?? "",
      // Giữ identity chủ trì khi Sửa — không có thì lần lưu sau sẽ mất avatar/quyền.
      chairmanEmployeeCode: meta.meetingChairmanEmployeeCode,
      chairmanUserId: meta.meetingChairmanAuthUserId,
      participants,
      format: meta.meetingFormat === "online" ? "online" : "offline",
      visibility: apiVisibilityToForm(selectedHrEvent?.visibility ?? extEvent.visibility),
      location: extEvent.meetingLocation || "",
      notes: extEvent.description || "",
      attachments: remoteAttachmentsToForm(selectedHrEvent?.attachments),
      createdById: extEvent.ownerId,
      createdByName:
        selectedHrEvent?.owner?.fullName ?? selectedHrEvent?.ownerName ?? undefined,
      // authUserId để form Sửa tra được avatar người tạo (tên thôi là không đủ).
      createdByUserId: selectedHrEvent?.ownerAuthUserId ?? undefined,
    };

    setEditingEvent(data);
  }, [selectedEventLive, selectedHrEvent, mode, apiEventsMap]);

  // Người được mời phản hồi (Tham gia / Từ chối) — nghiệp vụ trong hook dùng chung.
  const handleRespond = useCallback(
    async (response: "ACCEPTED" | "DECLINED") => {
      if (!selectedEvent) return;
      await mutations.respond(selectedEvent.id, response);
    },
    [selectedEvent, mutations],
  );

  // Xóa event đang mở (nghiệp vụ trong hook dùng chung).
  const handleDeleteEvent = useCallback(async () => {
    if (!selectedEvent) return;
    const ok = await mutations.remove(selectedEvent.id);
    if (ok) setSelectedEvent(null);
    setShowDeleteConfirm(false);
  }, [selectedEvent, mutations]);

  // Sửa lịch họp — throw khi thất bại để form giữ nguyên (modal đang mở).
  const handleUpdateEvent = useCallback(async (data: MeetingFormData) => {
    const ok = await mutations.updateMeeting(data);
    if (!ok) throw new Error("update meeting failed");
    setEditingEvent(null);
    setSelectedEvent(null);
  }, [mutations]);

  // Sửa lịch cá nhân — throw khi thất bại để form giữ nguyên.
  const handleUpdatePersonalEvent = useCallback(async (data: PersonalEventFormData) => {
    const ok = await mutations.updatePersonal(data);
    if (!ok) throw new Error("update personal event failed");
    setEditingPersonalEvent(null);
    setSelectedEvent(null);
  }, [mutations]);

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
                onSelectDate={handleDateClick}
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
                  onClick={handleBackToMyCalendar}
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
                {mode === "other" && viewingUserName ? (
                  // Đang xem lịch người khác: bấm tên để đổi người, bấm X để quay
                  // về lịch của mình (không reload trang).
                  <div className="flex items-center gap-1 rounded-lg bg-blue-50 px-1 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
                    <button
                      type="button"
                      onClick={() => setUserSearchModalOpen(true)}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-2 text-sm transition-micro hover:bg-blue-100/60 dark:hover:bg-blue-900/40"
                      title="Đổi người xem lịch"
                    >
                      <UserIcon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{viewingUserName}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleBackToMyCalendar}
                      title="Quay về lịch của tôi"
                      className="shrink-0 rounded-lg p-1.5 transition-micro hover:bg-blue-100 dark:hover:bg-blue-900/40"
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setUserSearchModalOpen(true)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-text-secondary transition-micro hover:bg-surface-hover"
                  >
                    <UserIcon className="h-4 w-4" />
                    Xem lịch người khác
                  </button>
                )}
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
                      onChange={() => handleFilterChange(filter.type)}
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
            {mode !== "other" && (
              <button
                type="button"
                onClick={() => openEventTypeChooser(formatDateString(selectedDate))}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface px-3 py-2 text-sm font-medium text-text-secondary hover:border-[#1976D2]/60 hover:bg-[#1565C0]/5 hover:text-[#1565C0] transition-micro"
              >
                <PlusIcon className="h-4 w-4" />
                Thêm lịch
              </button>
            )}
          </div>
        </aside>

        {/* Main calendar area */}
        <div className="relative flex flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
          {/* Loading overlay */}
          {storeLoading && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-surface/60">
              <div className="flex flex-col items-center gap-2 rounded-xl bg-surface p-4 shadow-lg">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span className="text-sm text-text-secondary">
                  Đang tải lịch...
                </span>
              </div>
            </div>
          )}
          {/* Header */}
          <header
            className={clsx(
              "shrink-0 border-b border-border px-4",
              mode === "other" ? "py-2" : "py-3",
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Month/Year title and navigation */}
              <div className="flex items-center gap-3">
                {/* Viewing others indicator */}
                {mode === "other" && viewingUserName && (
                  <div className="flex items-center gap-1.5 rounded-md bg-blue-50 px-2 py-1 dark:bg-blue-900/30">
                    <EyeIcon className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                    <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                      Lịch của <span className="font-semibold">{viewingUserName}</span>
                    </span>
                    <span className="rounded bg-orange-100 px-1 py-0.5 text-[10px] font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                      Chỉ xem
                    </span>
                  </div>
                )}
                {(mode === "my" || mode === "other") && (
                  <h2
                    className={clsx(
                      "font-semibold text-text-primary",
                      mode === "other" ? "text-sm" : "text-lg",
                    )}
                  >
                    {currentView === "day"
                      ? dayTitle
                      : currentView === "week"
                        ? weekTitle
                        : `${VIETNAMESE_MONTHS[currentMonth]} ${currentYear}`}
                  </h2>
                )}
                {/* Điều hướng ‹ › cho cả lịch mình và lịch người khác (chỉ đổi
                    khoảng xem; effect tự refetch lịch người đó theo tháng). */}
                {(mode === "my" || mode === "other") && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={
                        currentView === "day"
                          ? () => shiftSelected(-1)
                          : currentView === "week"
                            ? () => shiftSelected(-7)
                            : goToPrevMonth
                      }
                      title={currentView === "day" ? "Ngày trước" : currentView === "week" ? "Tuần trước" : "Tháng trước"}
                      className="rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-primary transition-micro"
                    >
                      <ChevronLeftIcon className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={
                        currentView === "day"
                          ? () => shiftSelected(1)
                          : currentView === "week"
                            ? () => shiftSelected(7)
                            : goToNextMonth
                      }
                      title={currentView === "day" ? "Ngày sau" : currentView === "week" ? "Tuần sau" : "Tháng sau"}
                      className="rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-primary transition-micro"
                    >
                      <ChevronRightIcon className="h-5 w-5" />
                    </button>
                  </div>
                )}
                {(mode === "my" || mode === "other") && (
                  <button
                    type="button"
                    onClick={goToToday}
                    className="rounded-xl bg-[#1565C0] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#1976D2] active:scale-95 shadow-sm shadow-[#1565C0]/25 transition-micro"
                  >
                    Hôm nay
                  </button>
                )}
              </div>

              {/* Notifications + View switcher */}
              <div className="flex items-center gap-2">
              <HrNotificationBell />
              <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1">
                {viewButtons.map((view) => (
                  <button
                    key={view.id}
                    type="button"
                    onClick={() => setView(view.id)}
                    className={clsx(
                      "rounded-md px-3 py-1.5 text-sm font-medium transition-micro",
                      currentView === view.id
                        ? "bg-[#1565C0] text-white shadow-sm"
                        : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                    )}
                  >
                    {view.label}
                  </button>
                ))}
              </div>
              </div>
            </div>
          </header>

          {/* Calendar grid */}
          {currentView === "month" && (
            <MonthGrid
              calendarDays={calendarDays}
              events={searchedEvents}
              getAttendanceForDate={getAttendanceForDate}
              isToday={isToday}
              isSelected={isSelected}
              isAttendanceFilterActive={isAttendanceFilterActive}
              showAttendance={mode !== "other"}
              onOpenDay={handleOpenDay}
              onEventClick={handleEventClick}
            />
          )}

          {/* Day view */}
          {currentView === "day" && (
            <DayView
              date={selectedDate}
              events={searchedEvents}
              attendance={mode !== "other" ? getAttendanceForDate(selectedDate) : undefined}
              onEventClick={handleEventClick}
              onSlotClick={mode !== "other" ? handleCreateAtSlot : undefined}
            />
          )}

          {/* Week view */}
          {currentView === "week" && (
            <WeekView
              weekDate={selectedDate}
              events={searchedEvents}
              attendanceData={mode !== "other" ? attendanceData : []}
              onDateClick={handleOpenDay}
              onEventClick={handleEventClick}
              onSlotClick={mode !== "other" ? handleCreateAtSlot : undefined}
              isToday={isToday}
              isSelected={isSelected}
            />
          )}
        </div>
      </div>

      {/* Event detail modal */}
      {selectedEventLive && (
        <EventDetailModal
          event={selectedEventLive}
          onClose={() => setSelectedEvent(null)}
          onEdit={handleEditEvent}
          onDelete={handleDeleteEvent}
          isViewingOthers={mode === "other"}
          hrEvent={selectedHrEvent}
          onRespond={handleRespond}
        />
      )}

      {/* Bộ chọn loại lịch: họp vs cá nhân */}
      <Modal
        isOpen={eventTypeChooserOpen}
        onClose={() => setEventTypeChooserOpen(false)}
        title="Thêm lịch"
        size="sm"
      >
        <p className="mb-4 text-sm text-text-secondary">
          Chọn loại lịch bạn muốn thêm.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => {
              setEventTypeChooserOpen(false);
              setMeetingModalOpen(true);
            }}
            className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface p-4 text-center transition-micro hover:border-[#1976D2]/60 hover:bg-[#1565C0]/5"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1976D2]/10 text-[#1565C0]">
              <UsersIcon className="h-6 w-6" />
            </span>
            <span className="text-sm font-medium text-text-primary">Lịch họp</span>
            <span className="text-[11px] text-text-muted">Mời người tham gia, chủ trì, địa điểm</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setEventTypeChooserOpen(false);
              setPersonalModalOpen(true);
            }}
            className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface p-4 text-center transition-micro hover:border-amber-500/60 hover:bg-amber-500/5"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <UserIcon className="h-6 w-6" />
            </span>
            <span className="text-sm font-medium text-text-primary">Lịch cá nhân</span>
            <span className="text-[11px] text-text-muted">Chỉ mình bạn — ngày, giờ, nội dung</span>
          </button>
        </div>
      </Modal>

      {/* Meeting form modal */}
      <MeetingFormModal
        isOpen={meetingModalOpen}
        onClose={() => setMeetingModalOpen(false)}
        onBack={() => {
          setMeetingModalOpen(false);
          setEventTypeChooserOpen(true);
        }}
        onSave={handleCreateEvent}
        defaultDate={meetingModalDate}
        defaultStartTime={meetingModalStart}
        defaultEndTime={meetingModalEnd}
        existingMeetings={meetingsForConflictCheck}
        isLoading={isCreatingEvent}
      />

      {/* Personal event form modal */}
      <PersonalEventFormModal
        isOpen={personalModalOpen}
        onClose={() => setPersonalModalOpen(false)}
        onBack={() => {
          setPersonalModalOpen(false);
          setEventTypeChooserOpen(true);
        }}
        onSave={handleCreatePersonalEvent}
        defaultDate={personalModalDate}
        defaultStartTime={personalModalStart}
        defaultEndTime={personalModalEnd}
        isLoading={isCreatingEvent}
      />

      {/* Edit event modal — loại chính event đang sửa khỏi danh sách check trùng */}
      <MeetingFormModal
        isOpen={!!editingEvent}
        onClose={() => setEditingEvent(null)}
        onSave={handleUpdateEvent}
        initialData={editingEvent}
        existingMeetings={meetingsForConflictCheck.filter((m) => m.id !== editingEvent?.id)}
      />

      {/* Edit personal event modal — lịch cá nhân sửa bằng form cá nhân */}
      <PersonalEventFormModal
        isOpen={!!editingPersonalEvent}
        onClose={() => setEditingPersonalEvent(null)}
        onSave={handleUpdatePersonalEvent}
        initialData={editingPersonalEvent}
      />

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDeleteEvent}
        title="Xóa sự kiện"
        message="Bạn có chắc muốn xóa sự kiện này? Hành động này không thể hoàn tác."
        confirmText="Xóa"
        cancelText="Hủy"
        variant="danger"
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
