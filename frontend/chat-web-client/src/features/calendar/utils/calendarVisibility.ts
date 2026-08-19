import type { HRCalendarVisibility } from "../../api/hrCalendarApi";

export type CalendarFormVisibility = "private" | "public";

export const meetingVisibilityToApi = (
  value: CalendarFormVisibility | undefined,
): HRCalendarVisibility => (value === "public" ? "PUBLIC" : "BUSY_ONLY");

export const personalVisibilityToApi = (
  value: CalendarFormVisibility | undefined,
): HRCalendarVisibility => (value === "public" ? "PUBLIC" : "PRIVATE");

export const apiVisibilityToForm = (
  value: string | null | undefined,
): CalendarFormVisibility => (value === "PUBLIC" ? "public" : "private");
