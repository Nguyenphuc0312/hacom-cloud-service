import { describe, expect, it } from "vitest";

import { formatShareLinkWhen } from "./formatShareLinkWhen";

// Dùng offset +07:00 tường minh để test không đổi kết quả theo timezone máy CI.
const START = "2026-07-28T16:30:00+07:00";
const END = "2026-07-28T18:00:00+07:00";

describe("formatShareLinkWhen", () => {
  it("gộp ngày + khoảng giờ cho lịch có giờ cụ thể", () => {
    const text = formatShareLinkWhen(START, END, false);
    expect(text).toContain("28/07/2026");
    expect(text).toContain("—");
    // Có đủ cả giờ bắt đầu và giờ kết thúc.
    expect(text).toMatch(/16.30/);
    expect(text).toMatch(/18.00/);
  });

  it("lịch cả ngày thì bỏ hẳn phần giờ", () => {
    const text = formatShareLinkWhen(START, END, true);
    expect(text).toContain("Cả ngày");
    expect(text).not.toMatch(/16.30/);
  });

  it("endAt hỏng thì vẫn hiện được giờ bắt đầu, không in Invalid Date", () => {
    const text = formatShareLinkWhen(START, "not-a-date", false);
    expect(text).toMatch(/16.30/);
    expect(text).not.toContain("Invalid");
    expect(text).not.toContain("—");
  });

  it("startAt hỏng thì trả rỗng để UI tự ẩn dòng", () => {
    expect(formatShareLinkWhen("not-a-date", END, false)).toBe("");
  });
});
