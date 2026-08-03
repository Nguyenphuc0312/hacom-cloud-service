import { describe, expect, it } from "vitest";

import { eventTitleOf, parseNotificationBody } from "./parseNotificationBody";

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

  it("lấy được tên lịch từ thông báo MỜI HỌP (câu dẫn khác)", () => {
    // Trước đây chỉ khớp "lịch họp:" nên dòng mời họp mất hẳn tên lịch.
    expect(
      parseNotificationBody("Trần Đăng Công đã mời bạn tham gia: Họp Bộ phận CĐS")
        .event,
    ).toBe("Họp Bộ phận CĐS");
  });

  it("lấy được tên lịch khi bị gỡ khỏi lịch", () => {
    expect(
      parseNotificationBody("Trần Đăng Công đã gỡ bạn khỏi: Họp tuần").event,
    ).toBe("Họp tuần");
  });
});

describe("eventTitleOf", () => {
  it("ưu tiên payload.eventTitle do BE gửi kèm", () => {
    expect(
      eventTitleOf({ eventTitle: "Họp CĐS" }, "A đã mời bạn tham gia: Tên cũ"),
    ).toBe("Họp CĐS");
  });

  it("thông báo cũ không có eventTitle thì rơi về cắt chuỗi", () => {
    expect(eventTitleOf(null, "A đã từ chối tham gia lịch họp: Hội ý")).toBe(
      "Hội ý",
    );
    expect(eventTitleOf({}, "A đã mời bạn tham gia: Hội ý")).toBe("Hội ý");
  });

  it("eventTitle rỗng/sai kiểu thì không dùng, quay về cắt chuỗi", () => {
    expect(
      eventTitleOf({ eventTitle: "   " }, "A đã mời bạn tham gia: Hội ý"),
    ).toBe("Hội ý");
    expect(eventTitleOf({ eventTitle: 42 }, "A đã mời bạn tham gia: Hội ý")).toBe(
      "Hội ý",
    );
  });
});
