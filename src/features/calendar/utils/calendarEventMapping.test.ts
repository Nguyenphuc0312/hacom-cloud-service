import { describe, expect, it } from "vitest";
import type { HRCalendarEvent } from "../../api/hrCalendarApi";
import type { CalendarEvent, EventType } from "../data/calendarEvents";
import {
  buildCalendarEventForm,
  buildExtendedEventMap,
  filterCalendarEventsByType,
  getMeetingMetadata,
  mapHrmEventToCalendarEvent,
  mapHrmEventToExtendedDetail,
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

  // Sidebar chỉ có 3 checkbox (meeting/personal/attendance) nhưng API vẫn trả TASK.
  // Loại không có ô để tick thì phải HIỆN, không được lọc mất.
  it("renders event types that have no sidebar checkbox instead of dropping them", () => {
    const taskEvent = mapHrmEventToCalendarEvent(
      makeHrmEvent({
        id: "t1",
        title: "Việc cần làm",
        startAt: "2026-06-04T01:00:00.000Z",
        endAt: "2026-06-04T02:00:00.000Z",
        eventType: "TASK",
        visibility: "PUBLIC",
      }),
    );
    expect(taskEvent.type).toBe("task");

    const visible = filterCalendarEventsByType(
      [taskEvent],
      ["meeting", "personal"],
      activeSidebarTypes,
    );
    expect(visible.map((e) => e.title)).toEqual(["Việc cần làm"]);
  });

  // Quy tắc lọc của WeeklyCalendarWidget (EmptyState): chỉ bỏ CHẤM CÔNG, mọi loại
  // khác API trả về đều phải hiện. Trước đây widget dùng allow-list
  // (meeting|personal) nên event TASK bị nuốt: API trả về mà lưới tuần trống.
  it("weekly widget drops only attendance, never other API types", () => {
    const widgetFilter = (e: CalendarEvent) => e.type !== "attendance";
    const byApiType = (id: string, eventType: string) =>
      mapHrmEventToCalendarEvent(
        makeHrmEvent({
          id,
          title: `ev-${id}`,
          startAt: "2026-06-04T01:00:00.000Z",
          endAt: "2026-06-04T02:00:00.000Z",
          eventType: eventType as HRCalendarEvent["eventType"],
          visibility: "PUBLIC",
        }),
      );

    const events = [
      byApiType("1", "MEETING"),
      byApiType("2", "PERSONAL"),
      byApiType("3", "TASK"),
      byApiType("4", "OTHER"),
      byApiType("5", "LEAVE"),
      byApiType("6", "ATTENDANCE"),
    ];

    const visible = events.filter(widgetFilter).map((e) => e.id);
    // Chỉ ATTENDANCE (id 6) bị loại; TASK (id 3) PHẢI còn.
    expect(visible).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("still hides a type the user actively unticked", () => {
    const meeting = mapHrmEventToCalendarEvent(
      makeHrmEvent({
        id: "m9",
        title: "Họp bị ẩn",
        startAt: "2026-06-04T01:00:00.000Z",
        endAt: "2026-06-04T02:00:00.000Z",
        eventType: "MEETING",
        visibility: "PUBLIC",
      }),
    );

    const visible = filterCalendarEventsByType(
      [meeting],
      ["personal"],
      activeSidebarTypes,
    );
    expect(visible).toHaveLength(0);
  });

  // Chuỗi đầu-cuối cho lưới tuần: event CHỦ NHẬT (ngày cuối tuần, sát ranh giới
  // tháng) từ API phải rơi đúng ô CN — không mất, không lệch sang T7.
  it("places a Sunday event on Sunday, not the neighbouring days", () => {
    // 26/07/2026 08:00 giờ VN = 01:00Z cùng ngày.
    const sunday = mapHrmEventToCalendarEvent(
      makeHrmEvent({
        id: "cn",
        title: "Họp chủ nhật",
        startAt: "2026-07-26T01:00:00.000Z",
        endAt: "2026-07-26T02:00:00.000Z",
        eventType: "MEETING",
        visibility: "PUBLIC",
      }),
    );

    const onDay = (d: number) =>
      eventOccursOnDay(sunday, new Date(2026, 6, d));

    expect(onDay(26)).toBe(true);
    expect(onDay(25)).toBe(false);
    expect(onDay(27)).toBe(false);
    // Ngày local phải là 26 chứ không phải 25 (lỗi kinh điển khi slice chuỗi UTC).
    expect(sunday.date).toBe("2026-07-26");
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

describe("getMeetingMetadata", () => {
  it("returns empty object when metadata missing or not an object", () => {
    expect(getMeetingMetadata(undefined)).toEqual({});
    expect(getMeetingMetadata(makeHrmEvent({ id: "x", title: "t", startAt: "2026-06-04T08:00:00.000Z", endAt: "2026-06-04T09:00:00.000Z", eventType: "MEETING", visibility: "PRIVATE" }))).toEqual({});
  });

  it("extracts chairman/format/attendees, ignoring wrong types", () => {
    const ev = makeHrmEvent({ id: "x", title: "t", startAt: "2026-06-04T08:00:00.000Z", endAt: "2026-06-04T09:00:00.000Z", eventType: "MEETING", visibility: "PRIVATE" });
    ev.metadata = { meetingChairman: "An", meetingFormat: "online", attendees: ["A", 5, "B"] } as unknown as HRCalendarEvent["metadata"];
    expect(getMeetingMetadata(ev)).toEqual({ meetingChairman: "An", meetingFormat: "online", attendees: ["A", "B"] });
  });
});

describe("mapHrmEventToExtendedDetail + buildExtendedEventMap", () => {
  const meetingEv = (() => {
    const ev = makeHrmEvent({ id: "m1", title: "Họp tuần", startAt: "2026-06-04T08:00:00.000Z", endAt: "2026-06-04T09:00:00.000Z", eventType: "MEETING", visibility: "TEAM" });
    ev.location = "Phòng 301";
    ev.metadata = { meetingChairman: "Nam", meetingFormat: "offline" } as unknown as HRCalendarEvent["metadata"];
    ev.participants = [
      { id: "p1", employeeId: "e1", authUserId: "u1", employeeCode: "EMP1", fullName: "Lan", avatarUrl: "http://a/lan.png", departmentName: null, employee: { id: "e1", fullName: "Lan Nguyen", employeeCode: "EMP1" }, response: "ACCEPTED", respondedAt: null, createdAt: "2026-06-01T00:00:00.000Z" },
      { id: "p2", employeeId: "e2", authUserId: null, employeeCode: "EMP2", fullName: null, avatarUrl: null, departmentName: null, employee: null, response: "PENDING", respondedAt: null, createdAt: "2026-06-01T00:00:00.000Z" },
    ];
    return ev;
  })();

  it("maps meeting detail fields + participant names/avatars", () => {
    const d = mapHrmEventToExtendedDetail(meetingEv);
    expect(d.id).toBe("m1");
    expect(d.title).toBe("Họp tuần");
    expect(d.type).toBe("meeting");
    expect(d.meetingLocation).toBe("Phòng 301");
    expect(d.meetingChairman).toBe("Nam");
    expect(d.meetingFormat).toBe("offline");
    expect(d.visibility).toBe("TEAM");
    // attendees = employee.fullName only (p2 has no employee.fullName → dropped)
    expect(d.attendees).toEqual(["Lan Nguyen"]);
    // avatars: p1 → fullName "Lan"; p2 → falls back to employeeCode "EMP2" (still has a name → kept)
    expect(d.attendeeAvatars).toEqual([
      { name: "Lan", avatarUrl: "http://a/lan.png" },
      { name: "EMP2", avatarUrl: null },
    ]);
  });

  it("normalizes unknown meetingFormat to undefined", () => {
    const ev = makeHrmEvent({ id: "m2", title: "x", startAt: "2026-06-04T08:00:00.000Z", endAt: "2026-06-04T09:00:00.000Z", eventType: "MEETING", visibility: "PRIVATE" });
    ev.metadata = { meetingFormat: "hybrid" } as unknown as HRCalendarEvent["metadata"];
    expect(mapHrmEventToExtendedDetail(ev).meetingFormat).toBeUndefined();
  });

  it("builds a map keyed by event id", () => {
    const map = buildExtendedEventMap([meetingEv]);
    expect(Object.keys(map)).toEqual(["m1"]);
    expect(map.m1.title).toBe("Họp tuần");
  });
});

describe("buildCalendarEventForm (prefill Sửa từ chat)", () => {
  it("maps a MEETING event to meeting form data with participants + metadata", () => {
    const ev = makeHrmEvent({
      id: "m1",
      title: "Họp tuần",
      startAt: "2026-06-04T01:00:00.000Z", // 08:00 giờ VN
      endAt: "2026-06-04T02:30:00.000Z", // 09:30 giờ VN
      eventType: "MEETING",
      visibility: "PUBLIC",
    });
    ev.location = "Phòng 301";
    ev.description = "abc";
    ev.metadata = {
      meetingChairman: "Nam",
      meetingFormat: "online",
      attendees: ["Khách A"],
    } as unknown as HRCalendarEvent["metadata"];
    ev.participants = [
      { id: "p1", employeeId: "e1", authUserId: "u1", employeeCode: "EMP1", fullName: "Lan", avatarUrl: null, departmentName: null, employee: { id: "e1", fullName: "Lan Nguyen", employeeCode: "EMP1" }, response: "ACCEPTED", respondedAt: null, createdAt: "2026-06-01T00:00:00.000Z" },
    ];

    const form = buildCalendarEventForm(ev);
    expect(form?.kind).toBe("meeting");
    if (form?.kind !== "meeting") throw new Error("expected meeting");
    expect(form.data).toMatchObject({
      id: "m1",
      title: "Họp tuần",
      date: "2026-06-04",
      startTime: "08:00",
      endTime: "09:30",
      chairman: "Nam",
      format: "online",
      visibility: "public",
      location: "Phòng 301",
      notes: "abc",
      createdById: "owner-1",
    });
    // Participant HR (giữ employeeId) + khách free-text từ metadata.
    expect(form.data.participants).toEqual([
      { name: "Lan", employeeId: "e1", employeeCode: "EMP1", userId: "u1" },
      { name: "Khách A" },
    ]);
  });

  // Không có createdByUserId thì form Sửa không tra được avatar người tạo → hàng
  // "Người tạo" mất avatar sau khi cập nhật.
  it("carries the owner authUserId so the edit form can resolve the creator avatar", () => {
    const ev = makeHrmEvent({
      id: "m2",
      startAt: "2026-06-04T01:00:00.000Z",
      endAt: "2026-06-04T02:00:00.000Z",
      eventType: "MEETING",
      visibility: "PUBLIC",
    });
    ev.ownerAuthUserId = "auth-owner-1";

    const form = buildCalendarEventForm(ev);
    if (form?.kind !== "meeting") throw new Error("expected meeting");
    expect(form.data.createdByUserId).toBe("auth-owner-1");
  });

  it("maps a PERSONAL event to personal form data (private default)", () => {
    const ev = makeHrmEvent({
      id: "p9",
      title: "Việc riêng",
      startAt: "2026-06-16T01:00:00.000Z",
      endAt: "2026-06-16T02:00:00.000Z",
      eventType: "PERSONAL",
      visibility: "PRIVATE",
    });
    const form = buildCalendarEventForm(ev);
    expect(form?.kind).toBe("personal");
    if (form?.kind !== "personal") throw new Error("expected personal");
    expect(form.data).toMatchObject({
      id: "p9",
      title: "Việc riêng",
      date: "2026-06-16",
      endDate: "2026-06-16",
      startTime: "08:00",
      endTime: "09:00",
      visibility: "private",
    });
  });
});

/**
 * Lịch phải đọc GIỐNG NHAU ở mọi nơi trên thế giới: giờ hiển thị bám
 * `HRCalendarEvent.timezone`, không bám giờ máy đang mở app.
 */
describe("đọc lịch từ nước ngoài (timezone của sự kiện, không phải của máy)", () => {
  const meetingIn = (timezone: string) =>
    mapHrmEventToCalendarEvent(
      makeHrmEvent({
        id: "tz1",
        title: "Họp",
        // 08:00 giờ VN.
        startAt: "2026-06-04T01:00:00.000Z",
        endAt: "2026-06-04T02:00:00.000Z",
        timezone,
        eventType: "MEETING",
        visibility: "PUBLIC",
      }),
    );

  it("sự kiện giờ VN luôn hiện 08:00 ngày 04/06, dù máy ở múi giờ nào", () => {
    const ev = meetingIn("Asia/Ho_Chi_Minh");
    expect(ev.date).toBe("2026-06-04");
    expect(ev.time).toBe("08:00");
    expect(ev.endTime).toBe("09:00");
  });

  it("sự kiện tạo ở múi giờ khác thì hiện theo đúng múi giờ ĐÓ", () => {
    expect(meetingIn("Asia/Tokyo").time).toBe("10:00");
    // New York lùi qua hôm trước: đổi cả ngày, không chỉ đổi giờ.
    const ny = meetingIn("America/New_York");
    expect(ny.time).toBe("21:00");
    expect(ny.date).toBe("2026-06-03");
  });

  it("timezone thiếu/rác thì rơi về giờ VN, không rơi về giờ máy", () => {
    expect(meetingIn("Khong/Ton_Tai").time).toBe("08:00");
  });

  it("xếp đúng ô ngày trên lưới lịch theo timezone sự kiện", () => {
    const ev = meetingIn("Asia/Ho_Chi_Minh");
    expect(eventOccursOnDay(ev, new Date(2026, 5, 4))).toBe(true);
    expect(eventOccursOnDay(ev, new Date(2026, 5, 3))).toBe(false);
    expect(eventOccursOnDay(ev, new Date(2026, 5, 5))).toBe(false);
  });

  it("sự kiện qua đêm vẫn trải đủ 2 ngày theo giờ sự kiện", () => {
    // 23:00 → 01:00 hôm sau, giờ VN.
    const overnight = mapHrmEventToCalendarEvent(
      makeHrmEvent({
        id: "tz2",
        title: "Trực đêm",
        startAt: "2026-06-04T16:00:00.000Z",
        endAt: "2026-06-04T18:00:00.000Z",
        timezone: "Asia/Ho_Chi_Minh",
        eventType: "MEETING",
        visibility: "PUBLIC",
      }),
    );
    expect(overnight.date).toBe("2026-06-04");
    expect(overnight.time).toBe("23:00");
    expect(overnight.endDate).toBe("2026-06-05");
    expect(eventOccursOnDay(overnight, new Date(2026, 5, 4))).toBe(true);
    expect(eventOccursOnDay(overnight, new Date(2026, 5, 5))).toBe(true);
  });

  it("kết thúc đúng 00:00 thì KHÔNG tô lem sang ngày hôm sau", () => {
    // 22:00 → 00:00 giờ VN: thực chất đã hết trong ngày 04.
    const untilMidnight = mapHrmEventToCalendarEvent(
      makeHrmEvent({
        id: "tz3",
        title: "Hết lúc nửa đêm",
        startAt: "2026-06-04T15:00:00.000Z",
        endAt: "2026-06-04T17:00:00.000Z",
        timezone: "Asia/Ho_Chi_Minh",
        eventType: "MEETING",
        visibility: "PUBLIC",
      }),
    );
    expect(untilMidnight.endTime).toBe("00:00");
    expect(eventOccursOnDay(untilMidnight, new Date(2026, 5, 4))).toBe(true);
    expect(eventOccursOnDay(untilMidnight, new Date(2026, 5, 5))).toBe(false);
  });
});
