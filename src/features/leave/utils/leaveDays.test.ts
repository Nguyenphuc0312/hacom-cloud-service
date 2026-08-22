import { describe, expect, it } from "vitest";

import { countCalendarLeaveDays } from "./leaveDays";

describe("countCalendarLeaveDays", () => {
  it("counts full single-day leave", () => {
    expect(countCalendarLeaveDays("2026-08-10", "2026-08-10", "FULL", "FULL")).toBe(1);
  });

  it("counts half-day leave", () => {
    expect(countCalendarLeaveDays("2026-08-10", "2026-08-10", "AM", "AM")).toBe(0.5);
    expect(countCalendarLeaveDays("2026-08-10", "2026-08-10", "PM", "PM")).toBe(0.5);
  });

  it("subtracts edge half-days for multi-day leave", () => {
    expect(countCalendarLeaveDays("2026-08-10", "2026-08-12", "PM", "AM")).toBe(2);
  });

  it("rejects invalid or reversed ranges", () => {
    expect(countCalendarLeaveDays("bad", "2026-08-12", "FULL", "FULL")).toBe(0);
    expect(countCalendarLeaveDays("2026-08-12", "2026-08-10", "FULL", "FULL")).toBe(0);
  });

  it("đếm cả ngày nghỉ — nên KHÔNG dùng làm số ngày trừ phép", () => {
    // Thứ 5 13/08 → Thứ 2 17/08 có 2 ngày cuối tuần ở giữa. Hàm này trả 5,
    // còn server (bỏ ngày không làm việc) trả ít hơn. Đây chính là lý do FE
    // không được gửi con số này lên như `totalDays`.
    expect(countCalendarLeaveDays("2026-08-13", "2026-08-17", "FULL", "FULL")).toBe(5);
  });
});
