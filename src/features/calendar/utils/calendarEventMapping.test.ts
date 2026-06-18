import { describe, expect, it } from "vitest";
import type { HRCalendarEvent } from "../../api/hrCalendarApi";
import type { CalendarEvent, EventType } from "../data/calendarEvents";
import {
  filterCalendarEventsByType,
  mapHrmEventToCalendarEvent,
  mergeCalendarEventSources,
} from "./calendarEventMapping";
import { eventOccursOnDay } from "./timeline";

const makeHrmEvent = (
  overrides: Pick<HRCalendarEvent, "id" | "title" | "startAt" | "endAt" | "eventType" | "visibility">,
): HRCalendarEvent => ({
  description: null,
  ownerId: "owner-1",
  owner: null,
  timezone: "Asia/Saigon",
  isAllDay: false,
  isRecurring: false,
  recurrenceRule: null,
  location: null,
  metadata: null,
  participants: [],
  canEdit: true,
  canDelete: true,
  canViewFullDetails: true,
  isParticipant: false,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
  ...overrides,
});

const hrmEvents: HRCalendarEvent[] = [
  makeHrmEvent({
    id: "1",
    title: "Họp",
    startAt: "2026-06-04T08:00:00.000Z",
    endAt: "2026-06-04T09:00:00.000Z",
    timezone: "Asia/Ho_Chi_Minh",
    eventType: "MEETING",
    visibility: "PRIVATE",
  }),
  makeHrmEvent({
    id: "2",
    title: "Dạy lập trình fullstack 17-13",
    startAt: "2026-06-16T00:20:00.000Z",
    endAt: "2026-06-16T05:00:00.000Z",
    eventType: "PERSONAL",
    visibility: "PUBLIC",
  }),
  makeHrmEvent({
    id: "3",
    title: "Dạy học tại Đại Nam",
    startAt: "2026-06-17T00:20:00.000Z",
    endAt: "2026-06-17T05:00:00.000Z",
    eventType: "OTHER",
    visibility: "PUBLIC",
  }),
  makeHrmEvent({
    id: "4",
    title: "Dạy học Đại Nam",
    startAt: "2026-06-17T06:05:00.000Z",
    endAt: "2026-06-17T10:45:00.000Z",
    eventType: "OTHER",
    visibility: "PUBLIC",
  }),
  makeHrmEvent({
    id: "5",
    title: "Dạy học Đại Nam",
    startAt: "2026-06-18T06:05:00.000Z",
    endAt: "2026-06-18T10:45:00.000Z",
    eventType: "OTHER",
    visibility: "PUBLIC",
  }),
  makeHrmEvent({
    id: "6",
    title: "Dạy học Đại Nam",
    startAt: "2026-06-19T00:20:00.000Z",
    endAt: "2026-06-19T05:00:00.000Z",
    eventType: "OTHER",
    visibility: "PUBLIC",
  }),
  makeHrmEvent({
    id: "7",
    title: "Dạy học Đại Nam",
    startAt: "2026-06-19T06:05:00.000Z",
    endAt: "2026-06-19T10:45:00.000Z",
    eventType: "OTHER",
    visibility: "PUBLIC",
  }),
];

const activeSidebarTypes: EventType[] = ["meeting", "personal", "attendance"];

describe("calendarEventMapping", () => {
  it("keeps HRM events visible when tasks calendar is empty", () => {
    const taskEvents: CalendarEvent[] = [];
    const normalizedHrmEvents = hrmEvents.map(mapHrmEventToCalendarEvent);
    const merged = mergeCalendarEventSources(taskEvents, normalizedHrmEvents);
    const visible = filterCalendarEventsByType(merged, activeSidebarTypes);

    expect(visible).toHaveLength(7);
    expect(visible.map((event) => event.title)).toContain("Họp");
    expect(visible.map((event) => event.title)).toContain("Dạy lập trình fullstack 17-13");
    expect(visible.filter((event) => event.title.includes("Đại Nam"))).toHaveLength(5);
  });

  it("maps HRM OTHER events into the visible personal bucket", () => {
    const normalizedHrmEvents = hrmEvents.map(mapHrmEventToCalendarEvent);
    const otherEvents = normalizedHrmEvents.filter((event) => ["3", "4", "5", "6", "7"].includes(event.id));

    expect(otherEvents.every((event) => event.type === "personal")).toBe(true);
  });

  it("groups June 2026 fixture events onto the expected local calendar days", () => {
    const normalizedHrmEvents = hrmEvents.map(mapHrmEventToCalendarEvent);
    const visible = filterCalendarEventsByType(normalizedHrmEvents, activeSidebarTypes);
    const eventsOn = (year: number, monthIndex: number, day: number) =>
      visible.filter((event) => eventOccursOnDay(event, new Date(year, monthIndex, day)));

    expect(eventsOn(2026, 5, 4).map((event) => event.title)).toEqual(["Họp"]);
    expect(eventsOn(2026, 5, 16).map((event) => event.title)).toEqual(["Dạy lập trình fullstack 17-13"]);
    expect(eventsOn(2026, 5, 17)).toHaveLength(2);
    expect(eventsOn(2026, 5, 18)).toHaveLength(1);
    expect(eventsOn(2026, 5, 19)).toHaveLength(2);
  });
});
