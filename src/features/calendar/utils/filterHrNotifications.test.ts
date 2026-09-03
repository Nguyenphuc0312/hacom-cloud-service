import { describe, expect, it } from "vitest";

import {
  filterHrNotifications,
  type FilterableNotification,
} from "./filterHrNotifications";

// Thứ Tư 05/08/2026 10:00 — giữa tuần để phân biệt "hôm nay" vs "tuần này".
const NOW = new Date(2026, 7, 5, 10, 0, 0);
const at = (d: number, h = 9): string => new Date(2026, 7, d, h).toISOString();

const invited = (day: number): FilterableNotification => ({
  type: "calendar.meeting.invited",
  createdAt: at(day),
});
const responded = (
  day: number,
  response: string,
): FilterableNotification => ({
  type: "calendar.meeting.participant_responded",
  createdAt: at(day),
  payload: { response },
});

describe("filterHrNotifications", () => {
  const items: FilterableNotification[] = [
    invited(5), // hôm nay
    responded(5, "ACCEPTED"), // hôm nay
    responded(4, "DECLINED"), // tuần này (T3)
    invited(1), // tuần TRƯỚC (T7 01/08)
    { type: "calendar.meeting.cancelled", createdAt: at(3) },
  ];

  it('"tất cả" giữ nguyên mọi thông báo', () => {
    expect(filterHrNotifications(items, "all", "all", NOW)).toHaveLength(5);
  });

  it('"hôm nay" chỉ lấy thông báo trong ngày', () => {
    const r = filterHrNotifications(items, "today", "all", NOW);
    expect(r).toHaveLength(2);
  });

  it('"tuần này" tính từ thứ Hai, loại thông báo tuần trước', () => {
    // 01/08/2026 là thứ Bảy tuần trước → phải bị loại.
    const r = filterHrNotifications(items, "week", "all", NOW);
    expect(r).toHaveLength(4);
    expect(r).not.toContainEqual(invited(1));
  });

  it("tách xác nhận và từ chối bằng payload.response", () => {
    expect(filterHrNotifications(items, "all", "accepted", NOW)).toHaveLength(1);
    expect(filterHrNotifications(items, "all", "declined", NOW)).toHaveLength(1);
  });

  it('MAYBE tính là đã phản hồi (nhóm "xác nhận"), không rơi vào từ chối', () => {
    const maybe = [responded(5, "MAYBE")];
    expect(filterHrNotifications(maybe, "all", "accepted", NOW)).toHaveLength(1);
    expect(filterHrNotifications(maybe, "all", "declined", NOW)).toHaveLength(0);
  });

  it('"mời họp" không lẫn thông báo phản hồi', () => {
    const r = filterHrNotifications(items, "all", "invited", NOW);
    expect(r).toHaveLength(2); // invited(5) + invited(1)
    expect(r.every((n) => n.type === "calendar.meeting.invited")).toBe(true);
  });

  it('"Thay đổi" gom cả sửa lịch lẫn huỷ/gỡ khỏi lịch', () => {
    // Hai loại này hiếm nên gộp một nút; tách riêng thì gần như luôn rỗng.
    const rows: FilterableNotification[] = [
      { type: "calendar.meeting.updated", createdAt: at(5) },
      { type: "calendar.meeting.cancelled", createdAt: at(5) },
      { type: "calendar.meeting.invited", createdAt: at(5) },
    ];
    expect(filterHrNotifications(rows, "all", "changed", NOW)).toHaveLength(2);
  });

  it('"timesheet" chi lay thong bao cong', () => {
    const rows: FilterableNotification[] = [
      { type: "timesheet.period.opened", createdAt: at(5) },
      { type: "timesheet.confirmation.disputed", createdAt: at(5) },
      { type: "calendar.meeting.invited", createdAt: at(5) },
    ];
    expect(filterHrNotifications(rows, "all", "timesheet", NOW)).toHaveLength(
      2,
    );
  });

  it("hai trục giao nhau chứ không cộng dồn", () => {
    // Hôm nay AND từ chối → DECLINED của hôm qua không được lọt.
    expect(filterHrNotifications(items, "today", "declined", NOW)).toHaveLength(
      0,
    );
  });

  it("createdAt hỏng thì vẫn hiện, không nuốt mất thông báo", () => {
    const broken = [{ type: "calendar.meeting.invited", createdAt: "??" }];
    expect(filterHrNotifications(broken, "today", "all", NOW)).toHaveLength(1);
  });
});
