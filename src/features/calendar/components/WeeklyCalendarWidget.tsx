/**
 * @fileoverview WeeklyCalendarWidget — lịch tuần thu gọn (họp + cá nhân) hiển thị
 * ở màn "chưa chọn hội thoại" (NoChatSelected). Dùng chung calendar store với
 * /calendar; mapping/màu/giờ khớp CalendarPage. Tách ra từ EmptyState.tsx để giữ
 * EmptyState là primitive UI thuần.
 *
 * Chi tiết sự kiện dùng CHUNG component EventDetailModal với /calendar → click
 * event ở đây mở popup đầy đủ ngay tại chỗ (quyền xem, đính kèm, roster người
 * tham gia + phản hồi, Xóa/Chỉnh sửa). Nút "Xem lịch đầy đủ →" mới chuyển sang
 * trang /calendar (view Tháng).
 */

import React from "react";
import clsx from "clsx";
import { useNavigate } from "react-router-dom";
import {
  UserIcon,
  UsersIcon,
  CalendarDaysIcon,
  ExclamationTriangleIcon,
  PlusIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { Modal } from "../../../components/ui/Modal";
import {
  MeetingFormModal,
  type MeetingFormData,
} from "../../../components/ui/MeetingFormModal";
import {
  PersonalEventFormModal,
  type PersonalEventFormData,
} from "../../../components/ui/PersonalEventFormModal";
import { useCalendarStore } from "../../../stores/calendarStore";
import { toast } from "../../../utils/toast";
import { getEventColor, type CalendarEvent, type ExtendedCalendarEvent } from "../data/calendarEvents";
import { AvatarStack, type Attendee } from "./DayView";
import { loadUserProfiles } from "../../../services/userBatchLoader";
import { resolvePublicResourceUrl } from "../../../config";
import {
  eventOccursOnDay,
  isMultiDayEvent,
  getMultiDayPosition,
  formatEventTimeRange,
} from "../utils/timeline";
import { apiVisibilityToForm } from "../utils/calendarVisibility";
import {
  mapHrmEventToCalendarEvent,
  buildExtendedEventMap,
  getMeetingMetadata,
  remoteAttachmentsToForm,
  toLocalDateString,
  toLocalTimeString,
} from "../utils/calendarEventMapping";
import { EventDetailModal } from "./EventDetailModal";
import { useCalendarEventMutations } from "../hooks/useCalendarEventMutations";
import { type HRCalendarEvent } from "../../api/hrCalendarApi";

const formatDateStr = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const WEEKDAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"] as const;

/** ISO 8601 week number — week containing the first Thursday is week 1 */
const getISOWeek = (date: Date): number => {
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
};

const getWeekDays = (base: Date): Date[] => {
  const day = base.getDay();
  const monday = new Date(base);
  monday.setDate(base.getDate() - (day === 0 ? 6 : day - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
};

const MAX_VISIBLE_EVENTS = 3;

class WidgetErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error) {
    console.error("[WidgetErrorBoundary] WeeklyCalendarWidget render error:", error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-border bg-surface p-4 text-sm text-text-muted">
          Không tải được lịch tuần. Vui lòng thử lại sau.
        </div>
      );
    }
    return this.props.children;
  }
}

const WeeklyCalendarWidgetInner: React.FC = () => {
  const navigate = useNavigate();
  const today = React.useMemo(() => new Date(), []);
  const [weekOffset, setWeekOffset] = React.useState(0);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [modalDefaultDate, setModalDefaultDate] = React.useState<string | undefined>();
  // "Thêm lịch" type chooser — họp vs cá nhân (đồng bộ với CalendarPage).
  const [eventTypeChooserOpen, setEventTypeChooserOpen] = React.useState(false);
  const [personalModalOpen, setPersonalModalOpen] = React.useState(false);
  // Chi tiết sự kiện đang mở (ExtendedCalendarEvent như CalendarPage truyền vào modal).
  const [selectedEvent, setSelectedEvent] = React.useState<ExtendedCalendarEvent | null>(null);
  // Form sửa: lịch họp và lịch cá nhân dùng 2 form khác nhau (giống CalendarPage).
  const [editingMeeting, setEditingMeeting] = React.useState<MeetingFormData | null>(null);
  const [editingPersonalEvent, setEditingPersonalEvent] =
    React.useState<PersonalEventFormData | null>(null);

  // Calendar store - shared source of truth
  const storeEvents = useCalendarStore((s) => s.events);
  const storeIsLoading = useCalendarStore((s) => s.isLoading);
  const storeError = useCalendarStore((s) => s.error);
  const storeErrorCode = useCalendarStore((s) => s.errorCode);
  const fetchEvents = useCalendarStore((s) => s.fetchEvents);

  const safeStoreEvents = React.useMemo(
    () => (Array.isArray(storeEvents) ? storeEvents : []),
    [storeEvents],
  );

  // Extended detail cho từng event (chairman/format/location/visibility/quyền) —
  // DÙNG CHUNG mapping với CalendarPage để popup chi tiết giống hệt /calendar.
  const apiEventsMap = React.useMemo(
    () => buildExtendedEventMap(safeStoreEvents),
    [safeStoreEvents],
  );

  // Raw HR event của item đang chọn — mang roster người tham gia + phản hồi + đính kèm.
  const selectedHrEvent = React.useMemo<HRCalendarEvent | undefined>(() => {
    if (!selectedEvent) return undefined;
    return safeStoreEvents.find((e) => e.id === selectedEvent.id);
  }, [selectedEvent, safeStoreEvents]);

  const weekDays = React.useMemo(() => {
    const base = new Date(today);
    base.setDate(today.getDate() + weekOffset * 7);
    return getWeekDays(base);
  }, [today, weekOffset]);

  // Khoảng FETCH bao phủ tuần đang xem nhưng LÙI 6 THÁNG ở đầu khoảng.
  // Lý do: lịch dài hạn (công tác/nghỉ phép có thể kéo dài 3–4 tháng) bắt đầu từ
  // nhiều tháng trước nhưng vẫn kéo sang tuần đang xem; backend lọc theo startAt
  // nên range hẹp sẽ KHÔNG trả các event dài bắt đầu xa. Lùi `from` về đầu tháng
  // cách 6 tháng để chắc bắt được; render vẫn lọc client theo eventOccursOnDay
  // nên chỉ hiện đúng 7 ngày của tuần.
  const weekRange = React.useMemo(() => {
    if (!weekDays.length) return { start: null, end: null };
    const first = weekDays[0];
    const last = weekDays[6];
    const start = new Date(first.getFullYear(), first.getMonth() - 6, 1, 0, 0, 0, 0);
    const end = new Date(last.getFullYear(), last.getMonth() + 1, 0, 23, 59, 59, 999);
    return {
      start: start.toISOString(),
      end: end.toISOString(),
    };
  }, [weekDays]);

  // Refetch theo đúng range của tuần đang xem (store có thể giữ range khác).
  const refetchWeek = React.useCallback(() => {
    if (weekRange.start && weekRange.end) {
      void fetchEvents(weekRange.start, weekRange.end);
    }
  }, [weekRange.start, weekRange.end, fetchEvents]);

  // Nghiệp vụ ghi lịch dùng CHUNG hook với CalendarPage (tạo/sửa/xóa/phản hồi) →
  // widget hành xử giống hệt /calendar, không nhân đôi logic.
  const mutations = useCalendarEventMutations({ onSuccess: refetchWeek });

  // Fetch events khi đổi tuần; đồng thời tự cập nhật khi quay lại tab và theo
  // chu kỳ 60s — không có WS cho lịch nên đây là cách giữ đồng bộ với thay đổi
  // từ /calendar hoặc người khác (mời họp).
  React.useEffect(() => {
    if (!weekRange.start || !weekRange.end) return;
    const refetch = () => {
      void fetchEvents(weekRange.start!, weekRange.end!);
    };
    refetch();
    const onFocus = () => refetch();
    window.addEventListener("focus", onFocus);
    const intervalId = window.setInterval(refetch, 60_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(intervalId);
    };
  }, [weekRange.start, weekRange.end, fetchEvents]);

  // Widget chỉ hiển thị lịch HỌP và lịch CÁ NHÂN (kể cả cá nhân dài hạn). Map
  // store events dùng CHUNG mapping với CalendarPage: type qua mapApiEventTypeToLocal
  // (meeting/personal…), giữ startAt/endAt để event nhiều ngày trải đủ cột ngày,
  // giờ/ngày convert UTC→local. Nhờ vậy màu phân loại (getEventColor) khớp /calendar.
  const mappedEvents = React.useMemo(
    () =>
      safeStoreEvents
        .map(mapHrmEventToCalendarEvent)
        // Chỉ HỌP & CÁ NHÂN (OTHER/LEAVE/REMINDER… đã map về personal); loại bỏ
        // mọi loại khác (vd attendance/task) nếu backend trả về.
        .filter((e) => e.type === "meeting" || e.type === "personal"),
    [safeStoreEvents],
  );

  // Avatar người tham gia lấy từ chat-web (/users/batch, GIỐNG Poll & /calendar).
  const [participantAvatars, setParticipantAvatars] = React.useState<Record<string, string | null>>({});
  React.useEffect(() => {
    const ids = [
      ...new Set(
        mappedEvents.flatMap((e) =>
          (e as ExtendedCalendarEvent).attendeeAvatars
            ?.map((a) => a.userId)
            .filter((id): id is string => !!id) ?? [],
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
  }, [mappedEvents]);

  const events: CalendarEvent[] = React.useMemo(() => {
    if (Object.keys(participantAvatars).length === 0) return mappedEvents;
    return mappedEvents.map((e) => {
      const ext = e as ExtendedCalendarEvent;
      return ext.attendeeAvatars?.length
        ? {
            ...ext,
            attendeeAvatars: ext.attendeeAvatars.map((a) =>
              a.userId && participantAvatars[a.userId]
                ? { ...a, avatarUrl: participantAvatars[a.userId] }
                : a,
            ),
          }
        : e;
    });
  }, [mappedEvents, participantAvatars]);

  const sortByTime = (a: CalendarEvent, b: CalendarEvent) =>
    (a.time ?? "").localeCompare(b.time ?? "");

  // Click event ở widget → mở popup chi tiết ĐẦY ĐỦ ngay tại chỗ (dùng chung
  // EventDetailModal với /calendar). Ưu tiên extended detail đã map; fallback
  // event của lưới nếu store chưa có.
  const handleEventClick = (event: CalendarEvent) => {
    const extended = apiEventsMap[event.id];
    setSelectedEvent(extended ?? (event as ExtendedCalendarEvent));
  };

  // Mở bộ chọn loại lịch (họp / cá nhân) với ngày điền sẵn.
  const openEventTypeChooser = (day: Date) => {
    setEditingMeeting(null);
    setModalDefaultDate(formatDateStr(day));
    setEventTypeChooserOpen(true);
  };

  // Lưu lịch họp. Phân biệt SỬA vs TẠO bằng state `editingMeeting` (KHÔNG dùng
  // data.id — form luôn tự sinh id giả `meeting-<ts>` khi tạo mới). Nghiệp vụ
  // (đính kèm, quyền xem, qua store…) nằm trong useCalendarEventMutations.
  const handleSaveMeeting = async (data: MeetingFormData) => {
    const ok = editingMeeting
      ? await mutations.updateMeeting(data)
      : await mutations.createMeeting(data);
    if (ok) {
      setEditingMeeting(null);
      setModalOpen(false);
    }
  };

  // Lịch cá nhân: chỉ mình bạn, không người tham gia/chủ trì.
  const handleSavePersonalEvent = async (data: PersonalEventFormData) => {
    const ok = editingPersonalEvent
      ? await mutations.updatePersonal(data)
      : await mutations.createPersonal(data);
    if (ok) {
      setEditingPersonalEvent(null);
      setPersonalModalOpen(false);
    }
  };

  // Chỉnh sửa event đang mở → mở form phù hợp (họp / cá nhân), điền sẵn dữ liệu.
  // Logic đồng bộ với CalendarPage.handleEditEvent.
  const handleEditEvent = () => {
    const ev = selectedEvent;
    if (!ev) return;
    if (ev.canEdit === false) {
      toast.warning("Bạn không có quyền chỉnh sửa sự kiện này.");
      return;
    }
    if (!ev.startAt) {
      toast.warning("Chỉ có thể chỉnh sửa lịch tạo từ hệ thống");
      return;
    }

    const startDate = toLocalDateString(ev.startAt);

    if (ev.type === "personal") {
      const personalData: PersonalEventFormData = {
        id: ev.id,
        title: ev.title,
        date: startDate,
        endDate: ev.endAt ? toLocalDateString(ev.endAt) : startDate,
        startTime: ev.startAt ? toLocalTimeString(ev.startAt) : "08:00",
        endTime: ev.endAt ? toLocalTimeString(ev.endAt) : "09:00",
        notes: ev.description || "",
        visibility: apiVisibilityToForm(selectedHrEvent?.visibility ?? ev.visibility),
        attachments: remoteAttachmentsToForm(selectedHrEvent?.attachments),
      };
      setSelectedEvent(null);
      setEditingPersonalEvent(personalData);
      return;
    }

    const meta = getMeetingMetadata(selectedHrEvent);
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
      : (ev.attendees || []).map((name) => ({ name }));

    const data: MeetingFormData = {
      id: ev.id,
      title: ev.title,
      date: startDate,
      startTime: ev.startAt ? toLocalTimeString(ev.startAt) : "08:00",
      endTime: ev.endAt ? toLocalTimeString(ev.endAt) : "09:00",
      chairman: meta.meetingChairman ?? "",
      participants,
      format: meta.meetingFormat === "online" ? "online" : "offline",
      visibility: apiVisibilityToForm(selectedHrEvent?.visibility ?? ev.visibility),
      location: ev.meetingLocation || "",
      notes: ev.description || "",
      attachments: remoteAttachmentsToForm(selectedHrEvent?.attachments),
      createdById: ev.ownerId,
    };
    setSelectedEvent(null);
    setEditingMeeting(data);
    setModalOpen(true);
  };

  const handleDeleteEvent = async () => {
    if (!selectedEvent) return;
    const ok = await mutations.remove(selectedEvent.id);
    if (ok) setSelectedEvent(null);
  };

  // Người được mời phản hồi (Tham gia / Từ chối).
  const handleRespond = async (response: "ACCEPTED" | "DECLINED") => {
    if (!selectedEvent) return;
    await mutations.respond(selectedEvent.id, response);
  };

  const isToday = (d: Date) =>
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();

  const isCurrentWeek = weekOffset === 0;

  const todayLabel = React.useMemo(() => {
    const dayNames = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
    return `${dayNames[today.getDay()]}, ${today.getDate()}/${today.getMonth() + 1}`;
  }, [today]);

  const weekLabel = React.useMemo(() => {
    if (!weekDays.length) return "";
    const thursday = weekDays[3];
    const weekNum = getISOWeek(thursday);
    return `${weekNum} · Tháng ${thursday.getMonth() + 1}/${thursday.getFullYear()}`;
  }, [weekDays]);

  return (
    <div className="mt-5 w-full overflow-hidden rounded-xl border border-border bg-surface shadow-elev1">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <CalendarDaysIcon className="h-5 w-5 text-[#1565C0]" />
          <span className="text-sm font-bold text-text-primary">Lịch tuần</span>
          <span className="text-sm text-text-muted">{weekLabel}</span>
          {isCurrentWeek && (
            <button
              type="button"
              onClick={() => setWeekOffset(0)}
              className="rounded-full px-2 py-0.5 text-xs font-bold text-white transition-micro hover:bg-[#1976D2] active:scale-[0.98] bg-[#1565C0]"
              style={{
                boxShadow: "0 1px 4px rgba(21, 101, 192, 0.3)",
              }}
            >
              Hôm nay · {todayLabel}
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Legend — chỉ họp & cá nhân (khớp getEventColor) */}
          <div className="hidden items-center gap-3 sm:flex">
            <span className="flex items-center gap-1 text-xs text-text-muted">
              <span className="h-2 w-2 rounded-full bg-teal-500" />
              Họp
            </span>
            <span className="flex items-center gap-1 text-xs text-text-muted">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              Cá nhân
            </span>
          </div>
          <div className="flex items-center gap-0.5">
            {!isCurrentWeek && (
              <button
                type="button"
                onClick={() => setWeekOffset(0)}
                className="rounded px-2 py-1 text-xs font-semibold text-amber-600 ring-1 ring-amber-400/50 bg-amber-400/10 hover:bg-amber-400/20 hover:text-amber-700 hover:ring-amber-400 transition-micro"
              >
                Tuần này
              </button>
            )}
            <button
              type="button"
              title="Tuần trước"
              onClick={() => setWeekOffset((p) => p - 1)}
              className="rounded p-1 text-text-muted hover:bg-surface-hover transition-micro"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Tuần sau"
              onClick={() => setWeekOffset((p) => p + 1)}
              className="rounded p-1 text-text-muted hover:bg-surface-hover transition-micro"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Bộ chọn loại lịch: họp vs cá nhân (đồng bộ với CalendarPage) */}
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
              setModalOpen(true);
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

      <MeetingFormModal
        isOpen={modalOpen || !!editingMeeting}
        onClose={() => {
          setModalOpen(false);
          setEditingMeeting(null);
        }}
        onBack={
          // Khi tạo mới (không phải sửa) → "Quay lại" mở lại bộ chọn loại lịch.
          editingMeeting
            ? undefined
            : () => {
                setModalOpen(false);
                setEventTypeChooserOpen(true);
              }
        }
        onSave={handleSaveMeeting}
        defaultDate={modalDefaultDate}
        initialData={editingMeeting}
      />

      <PersonalEventFormModal
        isOpen={personalModalOpen || !!editingPersonalEvent}
        onClose={() => {
          setPersonalModalOpen(false);
          setEditingPersonalEvent(null);
        }}
        onBack={
          editingPersonalEvent
            ? undefined
            : () => {
                setPersonalModalOpen(false);
                setEventTypeChooserOpen(true);
              }
        }
        onSave={handleSavePersonalEvent}
        defaultDate={modalDefaultDate}
        initialData={editingPersonalEvent}
      />

      {/* Chi tiết sự kiện — dùng CHUNG EventDetailModal với /calendar (đầy đủ:
          quyền xem, đính kèm, roster người tham gia + phản hồi, Xóa/Chỉnh sửa). */}
      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          hrEvent={selectedHrEvent}
          onClose={() => setSelectedEvent(null)}
          onEdit={handleEditEvent}
          onDelete={handleDeleteEvent}
          onRespond={handleRespond}
        />
      )}

      {/* Loading indicator — subtle bar, never hides the grid */}
      {storeIsLoading && (
        <div className="flex items-center gap-2 border-b border-border bg-surface px-4 py-1.5">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-[#1565C0] border-t-transparent" />
          <span className="text-[11px] text-text-muted">Đang tải lịch...</span>
        </div>
      )}

      {/* Error notice banner — soft, inline, never replaces the grid */}
      {storeError && !storeIsLoading && (
        <div className="mx-3 my-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800/40 dark:bg-amber-900/20">
          <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-amber-800 dark:text-amber-200">
              {storeErrorCode === "EMPLOYEE_LINK_REQUIRED"
                ? "Tài khoản chưa liên kết hồ sơ nhân sự. Lịch họp và phòng ban sẽ hiển thị sau khi liên kết."
                : storeError}
            </p>
            {storeErrorCode !== "FORBIDDEN" &&
              storeErrorCode !== "EMPLOYEE_INACTIVE" &&
              storeErrorCode !== "EMPLOYEE_LINK_REQUIRED" && (
              <div className="mt-1 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (weekRange.start && weekRange.end) {
                      void fetchEvents(weekRange.start, weekRange.end);
                    }
                  }}
                  className="text-[11px] font-semibold text-amber-700 hover:underline dark:text-amber-300"
                >
                  Thử lại
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/calendar")}
                  className="text-[11px] font-semibold text-[#1565C0] hover:underline"
                >
                  Xem lịch đầy đủ →
                </button>
              </div>
            )}
            {storeErrorCode === "EMPLOYEE_LINK_REQUIRED" && (
              <button
                type="button"
                onClick={() => navigate("/calendar")}
                className="mt-1 text-[11px] font-semibold text-[#1565C0] hover:underline"
              >
                Xem lịch →
              </button>
            )}
          </div>
        </div>
      )}

      {/* Grid — always rendered so the calendar shell is never lost due to an API error */}
      <div className="grid grid-cols-7 divide-x divide-border">
        {weekDays.map((day, i) => {
          const todayDay = isToday(day);
          // eventOccursOnDay (không phải getEventsByDate) để lịch cá nhân DÀI HẠN
          // trải đủ các ngày từ startAt→endAt, không chỉ ngày bắt đầu.
          const dayEvents = events.filter((e) => eventOccursOnDay(e, day));
          const isWeekend = i >= 5;

          // Chỉ họp & cá nhân; sắp theo giờ. Lịch dài hạn (nhiều ngày) render
          // dạng thanh trải ngang (bắt đầu → dây nối → kết thúc đỏ).
          const allEvents: Array<{
            id: string;
            time?: string;
            title: string;
            type: CalendarEvent["type"];
            isMultiDay: boolean;
            source: CalendarEvent;
          }> = dayEvents
            .slice()
            .sort(sortByTime)
            .map((e) => ({
              id: e.id,
              time: e.time,
              title: e.title,
              type: e.type,
              isMultiDay: isMultiDayEvent(e),
              source: e,
            }))
            // Ghim lịch dài ngày lên đầu để thanh trải nằm cùng hàng giữa các
            // ngày → nối liền thành "dây nối" liên tục; còn lại sắp theo giờ.
            .sort((a, b) => {
              if (a.isMultiDay !== b.isMultiDay) return a.isMultiDay ? -1 : 1;
              return (a.time ?? "").localeCompare(b.time ?? "");
            });

          const visibleEvents = allEvents.slice(0, MAX_VISIBLE_EVENTS);
          const overflowCount = allEvents.length - visibleEvents.length;
          const totalCount = allEvents.length;

          return (
            <div
              key={i}
              className={clsx(
                "flex flex-col p-2 sm:p-2.5",
                "min-h-[140px]",
                isWeekend && "bg-surface-overlay",
              )}
              style={todayDay && !isWeekend ? { backgroundColor: "rgba(255, 200, 87, 0.08)" } : undefined}
            >
              {/* Day header */}
              <div className="mb-2 flex flex-col items-center gap-1">
                {/* Hàng 1: tên thứ, căn giữa */}
                <span
                  className={clsx(
                    "text-[11px] font-semibold sm:text-xs",
                    isWeekend ? "text-rose-500" : "text-text-muted",
                  )}
                  style={todayDay && !isWeekend ? { color: "#1565C0" } : undefined}
                >
                  {WEEKDAY_LABELS[i]}
                </span>
                {/* Hàng 2: số ngày (trái) + nút Thêm lịch (phải) */}
                <div className="flex w-full items-center justify-between">
                  <div className="relative">
                    <span
                      className={clsx(
                        "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold sm:h-6 sm:w-6 sm:text-xs",
                        !todayDay && (isWeekend ? "text-rose-500" : "text-text-primary"),
                      )}
                      style={
                        todayDay
                          ? { background: "#DBEAFE", color: "#1565C0", boxShadow: "0 1px 4px rgba(255,200,87,0.45)" }
                          : undefined
                      }
                    >
                      {day.getDate()}
                    </span>
                    {totalCount > 0 && (
                      <span className="absolute -right-2 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[#FFC857] px-0.5 text-[9px] font-bold text-[#C41E3A]">
                        {totalCount}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    title={`Thêm lịch ngày ${day.getDate()}`}
                    onClick={() => openEventTypeChooser(day)}
                    className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 ring-1 ring-amber-400/50 bg-amber-400/10 hover:bg-amber-400/20 hover:text-amber-700 hover:ring-amber-400 transition-micro sm:text-[11px]"
                  >
                    <PlusIcon className="h-3 w-3" />
                    <span className="hidden sm:inline">Thêm lịch</span>
                  </button>
                </div>
              </div>

              {/* Events */}
              <div className="flex flex-1 flex-col gap-1">
                {visibleEvents.map((ev) => {
                  // Lịch dài ngày → thanh TRẢI NGANG: ngày bắt đầu hiện tiêu đề,
                  // ngày giữa chỉ là dây nối, ngày kết thúc tô đỏ (#DC2626).
                  // Margin âm để bar lấn vào padding ô, nối liền qua các ngày.
                  const span = ev.isMultiDay ? getMultiDayPosition(ev.source, day) : null;
                  if (span) {
                    const isEnd = span === "end";
                    const isStart = span === "start";
                    // Ngày GIỮA: chỉ một sợi chỉ mảnh căn giữa, nối liền hai
                    // badge to ở ngày bắt đầu & kết thúc.
                    if (!isStart && !isEnd) {
                      return (
                        <button
                          key={ev.id}
                          type="button"
                          onClick={() => handleEventClick(ev.source)}
                          title={ev.title}
                          className="-mx-2 flex h-5 items-center sm:-mx-2.5"
                        >
                          <span className="h-1 w-full bg-amber-400/80" />
                        </button>
                      );
                    }
                    return (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={() => handleEventClick(ev.source)}
                        title={isEnd ? `${ev.title} · Kết thúc` : ev.title}
                        className={clsx(
                          "relative flex h-5 min-w-0 items-center px-1.5 text-left text-[10px] font-semibold leading-none transition-micro hover:brightness-95 dark:hover:brightness-110 sm:text-[11px]",
                          isStart && "-mr-2 rounded-l sm:-mr-2.5",
                          isEnd && "-ml-2 rounded-r sm:-ml-2.5",
                          isEnd
                            ? "bg-[#DC2626] text-white"
                            : "bg-amber-400/80 text-amber-900 dark:text-amber-100",
                        )}
                      >
                        {isStart && <span className="truncate">{ev.title}</span>}
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

                  // Lịch trong ngày → badge bình thường theo loại.
                  const colors = getEventColor(ev.type);
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => handleEventClick(ev.source)}
                      className={clsx(
                        "flex min-w-0 w-full flex-col rounded border px-1.5 py-1 text-left text-[10px] leading-snug sm:text-[11px]",
                        "hover:brightness-95 dark:hover:brightness-110 transition-micro",
                        colors.bg,
                        colors.border,
                        colors.text,
                      )}
                      title={ev.title}
                    >
                      {(() => {
                        const range = formatEventTimeRange(ev.source);
                        const display = range ?? ev.time;
                        return display ? (
                          <span className="font-bold opacity-80">{display}</span>
                        ) : null;
                      })()}
                      <span className="truncate">{ev.title}</span>
                      {(() => {
                        const ext = ev.source as ExtendedCalendarEvent | undefined;
                        const people: Attendee[] = ext?.attendeeAvatars?.length
                          ? ext.attendeeAvatars
                          : (ext?.attendees ?? []).map((name) => ({ name }));
                        return people.length > 0 ? (
                          <div className="mt-1">
                            <AvatarStack people={people} max={3} />
                          </div>
                        ) : null;
                      })()}
                    </button>
                  );
                })}

                {overflowCount > 0 && (
                  <button
                    type="button"
                    onClick={() => navigate("/calendar")}
                    className="text-left text-[10px] font-semibold text-[#1565C0] hover:underline sm:text-[11px]"
                  >
                    +{overflowCount} mục khác
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border px-4 py-2">
        <span className="flex items-center gap-1 text-[11px] text-text-muted">
          <span className="flex h-4 w-4 items-center justify-center rounded border border-border text-[9px] font-bold text-text-muted">i</span>
          Nhấn vào sự kiện để xem chi tiết
        </span>
        <button
          type="button"
          onClick={() => navigate("/calendar", { state: { view: "month" } })}
          className="text-xs font-semibold text-[#1565C0] transition-micro hover:text-[#1976D2] active:scale-95"
        >
          Xem lịch đầy đủ →
        </button>
      </div>
    </div>
  );
};

/**
 * WeeklyCalendarWidget — bản dùng ngoài đã bọc sẵn error boundary (render lịch
 * lỗi không làm sập màn NoChatSelected).
 */
export const WeeklyCalendarWidget: React.FC = () => (
  <WidgetErrorBoundary>
    <WeeklyCalendarWidgetInner />
  </WidgetErrorBoundary>
);

export default WeeklyCalendarWidget;
