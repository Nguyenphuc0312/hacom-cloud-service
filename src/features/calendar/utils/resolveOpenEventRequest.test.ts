import { describe, expect, it } from "vitest";

import { resolveOpenEventRequest } from "./resolveOpenEventRequest";

describe("resolveOpenEventRequest", () => {
  it("bỏ qua khi không có nguồn nào yêu cầu mở", () => {
    expect(resolveOpenEventRequest(null, "")).toBeNull();
    expect(resolveOpenEventRequest(null, "?foo=bar")).toBeNull();
  });

  it("mở event từ ?eventId= (đường đi của chuông thông báo)", () => {
    // Chính là actionUrl hr-api trả về: /calendar?eventId=<id>
    expect(resolveOpenEventRequest(null, "?eventId=evt-1")?.openEventId).toBe(
      "evt-1",
    );
  });

  it("mở event từ location.state (widget lịch tuần)", () => {
    expect(
      resolveOpenEventRequest({ openEventId: "evt-2" }, "")?.openEventId,
    ).toBe("evt-2");
  });

  it("ưu tiên state hơn query khi cả hai cùng có", () => {
    expect(
      resolveOpenEventRequest({ openEventId: "evt-state" }, "?eventId=evt-query")
        ?.openEventId,
    ).toBe("evt-state");
  });

  it("chỉ đổi view thì vẫn hợp lệ, không kèm event", () => {
    const r = resolveOpenEventRequest({ view: "month" }, "");
    expect(r?.view).toBe("month");
    expect(r?.openEventId).toBeNull();
  });

  it("bấm thông báo thứ hai (id khác) phải ra khoá khác", () => {
    // Guard cũ là cờ boolean nên khoá vĩnh viễn sau lần đầu; đang ở sẵn
    // /calendar mà bấm tiếp thông báo khác thì không mở gì.
    const first = resolveOpenEventRequest(null, "?eventId=evt-1")!;
    const second = resolveOpenEventRequest(null, "?eventId=evt-2")!;
    expect(second.key).not.toBe(first.key);
  });

  it("cùng một yêu cầu lặp lại thì khoá giữ nguyên (không mở lại)", () => {
    const a = resolveOpenEventRequest(null, "?eventId=evt-1")!;
    const b = resolveOpenEventRequest(null, "?eventId=evt-1")!;
    expect(b.key).toBe(a.key);
  });
});
