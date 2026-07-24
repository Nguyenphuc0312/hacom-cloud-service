import type { HRCalendarEvent, CalendarAttachmentDto } from "../../api/hrCalendarApi";
import type { CalendarEvent, ExtendedCalendarEvent, EventType } from "../data/calendarEvents";
import type { CalendarLocalAttachment } from "../../../components/ui/CalendarAttachmentZone";
import type { MeetingFormData } from "../../../components/ui/MeetingFormModal";
import type { PersonalEventFormData } from "../../../components/ui/PersonalEventFormModal";
import { apiVisibilityToForm } from "./calendarVisibility";

const isImageMime = (mime: string | null | undefined) => (mime ?? "").startsWith("image/");

/**
 * Map attachment đã lưu ở BE (HRCalendarEvent.attachments) → dạng form REMOTE,
 * để pre-fill khi mở form sửa → không mất file cũ. Dùng chung cho CalendarPage
 * và WeeklyCalendarWidget.
 */
export const remoteAttachmentsToForm = (
  attachments: CalendarAttachmentDto[] | null | undefined,
): CalendarLocalAttachment[] =>
  (attachments ?? []).map((a) => ({
    id: a.fileId,
    previewUrl: isImageMime(a.mimeType) ? (a.thumbnailUrl ?? a.url) : null,
    name: a.filename ?? a.fileId,
    sizeBytes: a.sizeBytes ?? 0,
    mimeType: a.mimeType ?? "application/octet-stream",
    remoteFileId: a.fileId,
    downloadUrl: a.url ?? undefined,
  }));

const VISIBLE_FALLBACK_TYPE: EventType = "personal";

const formatDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/**
 * Convert an ISO timestamp (UTC from API) to LOCAL wall-clock HH:mm.
 * Never slice the raw string; that yields UTC time and shifts VN events by 7h.
 */
export const toLocalTimeString = (iso: string | null | undefined): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/**
 * Convert an ISO timestamp (UTC from API) to LOCAL date YYYY-MM-DD.
 */
export const toLocalDateString = (iso: string | null | undefined): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return formatDateString(d);
};

/**
 * Calendar sidebar currently exposes only meeting/personal/attendance filters.
 * Map HRM's catch-all and unknown event types to a visible bucket instead of
 * silently dropping them behind an unrendered local type.
 */
export const mapApiEventTypeToLocal = (apiType: string | null | undefined): EventType => {
  switch (apiType) {
    case "PERSONAL":
      return "personal";
    case "MEETING":
      return "meeting";
    case "ATTENDANCE":
      return "attendance";
    case "TASK":
      return "task";
    case "OTHER":
    case "LEAVE":
    case "DEADLINE":
    case "REMINDER":
    case "UNIT":
    case "LEADER":
    case "WORK":
    default:
      return VISIBLE_FALLBACK_TYPE;
  }
};

export const mapEventTypeForDisplay = (
  event: Pick<HRCalendarEvent, "eventType">,
): EventType => mapApiEventTypeToLocal(event.eventType);

export const localizeEventTitle = (title: string | null | undefined): string => {
  const t = (title ?? "").trim();
  return t.toLowerCase() === "busy" ? "Bận" : t;
};

export const mapHrmEventToCalendarEvent = (event: HRCalendarEvent): ExtendedCalendarEvent => ({
  id: event.id,
  title: localizeEventTitle(event.title),
  date: toLocalDateString(event.startAt),
  type: mapEventTypeForDisplay(event),
  description: event.description ?? undefined,
  time: toLocalTimeString(event.startAt),
  startAt: event.startAt,
  endAt: event.endAt,
  isAllDay: event.isAllDay,
  attendeeAvatars: buildAttendeeAvatars(event),
});

/**
 * Avatar stack = owner (người tạo) + participants (người được mời), dedup.
 * BE không tự thêm owner vào participants[] (xem buildParticipantPayload trong
 * useCalendarEventMutations), nên FE ghép owner lên đầu để đồng bộ 2 chiều: cả người tạo lẫn người nhận đều
 * thấy đủ mặt. avatarUrl của owner đợi BE (HRCalendarOwner chưa có) → fallback initials.
 */
const buildAttendeeAvatars = (
  event: HRCalendarEvent,
): Array<{ name: string; avatarUrl?: string | null; userId?: string | null }> => {
  const out: Array<{ name: string; avatarUrl?: string | null; userId?: string | null }> = [];
  const seen = new Set<string>();
  const push = (name: string, avatarUrl?: string | null, userId?: string | null) => {
    const key = name.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ name: name.trim(), avatarUrl, userId });
  };

  const ownerName = event.owner?.fullName ?? event.ownerName ?? "";
  // userId = chat authUserId → CalendarPage batch-load avatar từ chat-web (như Poll).
  push(
    ownerName,
    (event.owner as { avatarUrl?: string | null } | null)?.avatarUrl,
    event.ownerAuthUserId,
  );

  for (const p of event.participants ?? []) {
    push(
      p.fullName ?? p.employee?.fullName ?? p.employeeCode ?? "",
      p.avatarUrl,
      p.authUserId,
    );
  }
  return out;
};

/** Meeting extras stored in HR event metadata JSON. */
export interface MeetingMetadata {
  meetingChairman?: string;
  meetingFormat?: string;
  attendees?: string[];
}

export const getMeetingMetadata = (event: HRCalendarEvent | undefined): MeetingMetadata => {
  const meta = event?.metadata;
  if (!meta || typeof meta !== "object") return {};
  const m = meta as Record<string, unknown>;
  return {
    meetingChairman: typeof m.meetingChairman === "string" ? m.meetingChairman : undefined,
    meetingFormat: typeof m.meetingFormat === "string" ? m.meetingFormat : undefined,
    attendees: Array.isArray(m.attendees)
      ? m.attendees.filter((a): a is string => typeof a === "string")
      : undefined,
  };
};

/**
 * Extended mapping cho detail view (EventDetailModal): base fields + meeting extras
 * (chairman/format/location/visibility/quyền) + tên người tham gia. Thuần → memo hoá
 * ở CalendarPage (không còn effect+setState). Tên người: participants (hr-api) hoặc
 * attendees free-text (chat-api).
 */
export const mapHrmEventToExtendedDetail = (
  event: HRCalendarEvent,
): ExtendedCalendarEvent => {
  const attendeeNames =
    "participants" in event && Array.isArray(event.participants)
      ? event.participants
          .filter((p) => p.employee?.fullName)
          .map((p) => p.employee!.fullName)
      : "attendees" in event && Array.isArray(event.attendees)
        ? (event.attendees as string[])
        : [];

  const attendeeAvatars =
    "participants" in event && Array.isArray(event.participants)
      ? event.participants
          .map((p) => ({
            name: p.fullName ?? p.employee?.fullName ?? p.employeeCode ?? "",
            avatarUrl: p.avatarUrl,
          }))
          .filter((p) => p.name)
      : undefined;

  const meta = getMeetingMetadata(event);
  return {
    id: event.id,
    title: localizeEventTitle(event.title),
    date: toLocalDateString(event.startAt),
    type: mapEventTypeForDisplay(event),
    description: event.description ?? undefined,
    time: toLocalTimeString(event.startAt),
    startAt: event.startAt,
    endAt: event.endAt,
    meetingLocation: event.location ?? undefined,
    meetingChairman: meta.meetingChairman,
    meetingFormat:
      meta.meetingFormat === "online"
        ? "online"
        : meta.meetingFormat === "offline"
          ? "offline"
          : undefined,
    attendees: attendeeNames,
    attendeeAvatars,
    visibility: event.visibility,
    ownerId: event.ownerId,
    canEdit: event.canEdit,
    canDelete: event.canDelete,
  };
};

/** Build map eventId → extended detail (dùng cho detail view lookup). */
export const buildExtendedEventMap = (
  events: ReadonlyArray<HRCalendarEvent>,
): Record<string, ExtendedCalendarEvent> => {
  const map: Record<string, ExtendedCalendarEvent> = {};
  for (const event of events) {
    map[event.id] = mapHrmEventToExtendedDetail(event);
  }
  return map;
};

/**
 * Map một HR event → dữ liệu prefill cho form Sửa (họp hoặc cá nhân).
 *
 * Hàm THUẦN, tách từ logic prefill của CalendarPage.handleEditEvent để dùng lại
 * ở màn chat AI (sửa lịch tại chỗ, không rời trang). Khác handleEditEvent: nhận
 * thẳng HRCalendarEvent (chat đã fetch được qua getEvent) thay vì tra
 * ExtendedCalendarEvent + apiEventsMap của trang Lịch.
 *
 * Trả `null` nếu event không phải loại sửa được bằng 2 form này (vd ATTENDANCE
 * — không có form) → caller không mở form.
 *
 * ponytail: cùng ý nghĩa với nhánh prefill trong CalendarPage.handleEditEvent.
 * Chưa gộp CalendarPage vào đây để tránh rủi ro hồi quy trang Lịch; nếu sau này
 * sửa quy tắc prefill, đồng bộ cả 2 chỗ (hoặc refactor CalendarPage dùng hàm này).
 */
export const buildCalendarEventForm = (
  event: HRCalendarEvent,
):
  | { kind: "meeting"; data: MeetingFormData }
  | { kind: "personal"; data: PersonalEventFormData }
  | null => {
  const type = mapEventTypeForDisplay(event);
  const startDate = event.startAt
    ? toLocalDateString(event.startAt)
    : formatDateString(new Date());

  if (type === "personal") {
    return {
      kind: "personal",
      data: {
        id: event.id,
        title: localizeEventTitle(event.title),
        date: startDate,
        // endAt có thể sang ngày khác (qua đêm / nhiều ngày) → lấy ngày local của endAt.
        endDate: event.endAt ? toLocalDateString(event.endAt) : startDate,
        startTime: event.startAt ? toLocalTimeString(event.startAt) : "08:00",
        endTime: event.endAt ? toLocalTimeString(event.endAt) : "09:00",
        notes: event.description ?? "",
        visibility: apiVisibilityToForm(event.visibility),
        attachments: remoteAttachmentsToForm(event.attachments),
      },
    };
  }

  // Meeting (và các loại khác dùng form họp — TASK/OTHER…). ATTENDANCE không sửa
  // được: BE không tạo qua form này, nhưng cũng không có nút Sửa (canEdit=false).
  const meta = getMeetingMetadata(event);
  const participants: MeetingFormData["participants"] = [
    ...(event.participants ?? []).map((p) => ({
      name: p.fullName ?? p.employee?.fullName ?? p.employeeCode ?? "N/A",
      employeeId: p.employeeId,
      employeeCode: p.employeeCode ?? p.employee?.employeeCode ?? undefined,
      userId: p.authUserId ?? undefined,
    })),
    ...(meta.attendees ?? []).map((name) => ({ name })),
  ];

  return {
    kind: "meeting",
    data: {
      id: event.id,
      title: localizeEventTitle(event.title),
      date: startDate,
      startTime: event.startAt ? toLocalTimeString(event.startAt) : "08:00",
      endTime: event.endAt ? toLocalTimeString(event.endAt) : "09:00",
      chairman: meta.meetingChairman ?? "",
      participants,
      format: meta.meetingFormat === "online" ? "online" : "offline",
      visibility: apiVisibilityToForm(event.visibility),
      location: event.location ?? "",
      notes: event.description ?? "",
      attachments: remoteAttachmentsToForm(event.attachments),
      createdById: event.ownerId,
      createdByName: event.owner?.fullName ?? event.ownerName ?? undefined,
      createdByUserId: event.ownerAuthUserId ?? undefined,
    },
  };
};

export const mergeCalendarEventSources = (
  ...sources: ReadonlyArray<ReadonlyArray<CalendarEvent>>
): CalendarEvent[] => sources.flat();

/**
 * Lọc theo checkbox sidebar — nhưng CHỈ trừ đúng loại người dùng chủ động bỏ tick.
 *
 * Trước đây dùng allow-list (`active.has(event.type)`) nên mọi loại KHÔNG có
 * checkbox tương ứng đều bị nuốt im lặng: sidebar chỉ có meeting/personal/attendance,
 * còn `mapApiEventTypeToLocal` vẫn sinh ra "task" → event TASK từ API tạo được
 * nhưng không bao giờ hiện. Mặc định của lịch là HIỂN THỊ những gì API trả về;
 * ẩn phải là hành động có chủ đích của người dùng.
 *
 * @param knownTypes các loại có checkbox thật (mới áp dụng ẩn/hiện). Loại nằm
 *   ngoài danh sách này luôn được render.
 */
export const filterCalendarEventsByType = (
  events: ReadonlyArray<CalendarEvent>,
  activeTypes: ReadonlyArray<EventType>,
  knownTypes: ReadonlyArray<EventType> = activeTypes,
): CalendarEvent[] => {
  const active = new Set(activeTypes);
  const known = new Set(knownTypes);
  return events.filter((event) => !known.has(event.type) || active.has(event.type));
};
