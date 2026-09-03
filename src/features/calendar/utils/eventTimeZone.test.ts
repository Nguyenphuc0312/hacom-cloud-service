import { describe, expect, it } from "vitest";

import {
  DEFAULT_EVENT_TIME_ZONE,
  formatEventDateVi,
  getEventWallClock,
  resolveEventTimeZone,
} from "./eventTimeZone";

/**
 * Toàn bộ test ở đây phải cho kết quả GIỐNG NHAU ở mọi múi giờ máy chạy — đó
 * chính là điều bản cũ không làm được (xem formatShareLinkWhen.test.ts).
 */
describe("resolveEventTimeZone", () => {
  it("giữ nguyên IANA zone hợp lệ", () => {
    expect(resolveEventTimeZone("Asia/Tokyo")).toBe("Asia/Tokyo");
    // Alias cũ của Asia/Ho_Chi_Minh, dữ liệu thật đang dùng.
    expect(resolveEventTimeZone("Asia/Saigon")).toBe("Asia/Saigon");
  });

  it("rơi về giờ VN khi thiếu / rỗng / rác", () => {
    for (const bad of [null, undefined, "", "   ", "Khong/Ton_Tai", "12345"]) {
      expect(resolveEventTimeZone(bad)).toBe(DEFAULT_EVENT_TIME_ZONE);
    }
  });
});

describe("getEventWallClock", () => {
  // 2026-06-04T01:00:00Z = 08:00 giờ VN = 10:00 Tokyo = 21:00 (03/06) New York.
  const ISO = "2026-06-04T01:00:00.000Z";

  it("đọc đúng giờ tường theo múi giờ của sự kiện", () => {
    expect(getEventWallClock(ISO, "Asia/Ho_Chi_Minh")).toEqual({
      date: "2026-06-04",
      time: "08:00",
    });
    expect(getEventWallClock(ISO, "Asia/Tokyo")).toEqual({
      date: "2026-06-04",
      time: "10:00",
    });
  });

  it("đổi cả NGÀY khi múi giờ làm mốc vắt qua nửa đêm", () => {
    // Đây là ca hỏng nặng nhất nếu dùng giờ máy: lệch ngày, không chỉ lệch giờ.
    expect(getEventWallClock(ISO, "America/New_York")).toEqual({
      date: "2026-06-03",
      time: "21:00",
    });
  });

  it("nửa đêm ra 00:00 chứ không phải 24:00", () => {
    expect(
      getEventWallClock("2026-06-03T17:00:00.000Z", "Asia/Ho_Chi_Minh"),
    ).toEqual({ date: "2026-06-04", time: "00:00" });
  });

  it("thiếu timeZone thì dùng giờ VN, không dùng giờ máy", () => {
    expect(getEventWallClock(ISO, null)).toEqual({
      date: "2026-06-04",
      time: "08:00",
    });
  });

  it("timeZone rác thì rơi về giờ VN thay vì ném lỗi làm vỡ màn lịch", () => {
    expect(getEventWallClock(ISO, "Khong/Ton_Tai")).toEqual({
      date: "2026-06-04",
      time: "08:00",
    });
  });

  it("ISO hỏng / rỗng thì trả null để nơi gọi tự xử lý", () => {
    expect(getEventWallClock("not-a-date", "UTC")).toBeNull();
    expect(getEventWallClock("", "UTC")).toBeNull();
    expect(getEventWallClock(null, "UTC")).toBeNull();
  });

  it("xử lý đúng múi giờ lệch 30/45 phút", () => {
    // Kathmandu +05:45 — bẫy kinh điển với code giả định offset tròn giờ.
    expect(getEventWallClock(ISO, "Asia/Kathmandu")).toEqual({
      date: "2026-06-04",
      time: "06:45",
    });
  });

  it("tôn trọng giờ mùa hè (DST) của múi giờ sự kiện", () => {
    // London: mùa đông = UTC, mùa hè = UTC+1.
    expect(getEventWallClock("2026-01-15T12:00:00.000Z", "Europe/London")?.time).toBe(
      "12:00",
    );
    expect(getEventWallClock("2026-07-15T12:00:00.000Z", "Europe/London")?.time).toBe(
      "13:00",
    );
  });
});

describe("formatEventDateVi", () => {
  it("đổi YYYY-MM-DD (giá trị kỹ thuật) sang dd/mm/yyyy để hiển thị", () => {
    expect(formatEventDateVi("2026-06-04")).toBe("04/06/2026");
    expect(formatEventDateVi("2026-12-31")).toBe("31/12/2026");
  });

  it("giữ nguyên chuỗi lạ thay vì nuốt mất dữ liệu", () => {
    expect(formatEventDateVi("")).toBe("");
    expect(formatEventDateVi("04/06/2026")).toBe("04/06/2026");
  });
});
