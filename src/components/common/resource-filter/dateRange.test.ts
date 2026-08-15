import { describe, it, expect } from "vitest";
import { isoRangeToSearchWindow } from "./dateRange";

/**
 * `GET /messages/search` so sánh `from`/`to` như MỐC THỜI GIAN chứ không phải
 * ngày. Đo trên API thật (nhóm "Core Hacom"): `from=2026-08-14&to=2026-08-14`
 * trả total=0, trong khi nới `to` sang `2026-08-15` trả 19 tin — tất cả đều là
 * tin ngày 14. Nói cách khác `to` bị hiểu là 00:00 nên cắt mất trọn ngày cuối.
 */
describe("isoRangeToSearchWindow", () => {
  it("đẩy `to` tới cuối ngày để không mất ngày cuối của khoảng", () => {
    const { from, to } = isoRangeToSearchWindow("2026-08-14", "2026-08-14");

    expect(from).toBeDefined();
    expect(to).toBeDefined();
    // Cùng một ngày vẫn phải là khoảng có độ dài ~24h, không phải 0.
    const spanMs = new Date(to!).getTime() - new Date(from!).getTime();
    expect(spanMs).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(spanMs).toBeLessThan(24 * 60 * 60 * 1000);
  });

  it("bám theo ngày lịch ĐỊA PHƯƠNG, không phải ngày UTC", () => {
    const { from, to } = isoRangeToSearchWindow("2026-08-14", "2026-08-14");

    // Dựng lại từ mốc trả về: phải rơi đúng vào ngày 14 theo giờ máy.
    expect(new Date(from!).getDate()).toBe(14);
    expect(new Date(from!).getHours()).toBe(0);
    expect(new Date(to!).getDate()).toBe(14);
    expect(new Date(to!).getHours()).toBe(23);
  });

  it("cho phép chỉ đặt một đầu khoảng", () => {
    expect(isoRangeToSearchWindow("2026-08-14", null)).toEqual({
      from: expect.any(String),
    });
    expect(isoRangeToSearchWindow(null, "2026-08-14")).toEqual({
      to: expect.any(String),
    });
  });

  it("bỏ qua giá trị rỗng/sai định dạng thay vì gửi NaN lên API", () => {
    expect(isoRangeToSearchWindow(null, null)).toEqual({});
    expect(isoRangeToSearchWindow("khong-phai-ngay", null)).toEqual({});
  });
});
