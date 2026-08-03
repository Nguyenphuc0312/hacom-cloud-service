import { describe, expect, it } from "vitest";

import { parseNotificationBody } from "./parseNotificationBody";

describe("parseNotificationBody", () => {
  it("tách tên cuộc họp ra khỏi câu kể", () => {
    // Đúng chuỗi hr-api sinh ra ở calendar.service.ts.
    const r = parseNotificationBody(
      "Nguyễn Thế Huy Hoàng đã từ chối tham gia lịch họp: Hội ý nhóe",
    );
    expect(r.event).toBe("Hội ý nhóe");
    expect(r.reason).toBeNull();
  });

  it("tách cả lý do khi có", () => {
    const r = parseNotificationBody(
      "Nguyễn Thế Huy Hoàng đã từ chối tham gia lịch họp: Hội ý nhóe — Lý do: Không thích lam",
    );
    expect(r.event).toBe("Hội ý nhóe");
    expect(r.reason).toBe("Không thích lam");
  });

  it("giữ nguyên lý do có chứa dấu gạch dài", () => {
    // Cắt bằng split()[1] sẽ mất vế sau — phải nối lại phần đuôi.
    const r = parseNotificationBody(
      "A đã từ chối tham gia lịch họp: Họp tuần — Lý do: bận — đi công tác",
    );
    expect(r.reason).toBe("bận — đi công tác");
  });

  it("body không theo mẫu thì trả null để rơi về title", () => {
    expect(parseNotificationBody("Bạn được mời họp").event).toBeNull();
    expect(parseNotificationBody(null).event).toBeNull();
    expect(parseNotificationBody("").event).toBeNull();
  });

  it("lý do rỗng coi như không có, không hiện khối trích dẫn trống", () => {
    const r = parseNotificationBody("A đã từ chối tham gia lịch họp: X — Lý do:   ");
    expect(r.event).toBe("X");
    expect(r.reason).toBeNull();
  });
});
