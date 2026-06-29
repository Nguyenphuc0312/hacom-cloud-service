import type { HRCalendarEvent } from "../../api/hrCalendarApi";
import type { CalendarEvent, ExtendedCalendarEvent, EventType } from "../data/calendarEvents";

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
 * BE không tự thêm owner vào participants[] (xem CalendarPage buildParticipantPayload),
 * nên FE ghép owner lên đầu để đồng bộ 2 chiều: cả người tạo lẫn người nhận đều
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

export const mergeCalendarEventSources = (
  ...sources: ReadonlyArray<ReadonlyArray<CalendarEvent>>
): CalendarEvent[] => sources.flat();

export const filterCalendarEventsByType = (
  events: ReadonlyArray<CalendarEvent>,
  activeTypes: ReadonlyArray<EventType>,
): CalendarEvent[] => {
  const active = new Set(activeTypes);
  return events.filter((event) => active.has(event.type));
};
