/**
 * Khoảng fetch quyết định BAO NHIÊU event phải tải mỗi lần đổi tháng/tuần. Lùi 6
 * tháng như trước làm khối lượng gấp ~8 lần → chạm trần gom trang sớm → mất event
 * âm thầm. Test khoá lại: chỉ đệm 1 tuần, và luôn phủ hết phần lưới hiển thị.
 */
import { describe, expect, it } from "vitest";

import {
  buildFetchRange,
  getMonthFetchRange,
  getWeekFetchRange,
} from "./calendarFetchRange";

const daysBetween = (from: string, to: string) =>
  (new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) /
  86_400_000;

describe("getMonthFetchRange", () => {
  it("phủ trọn tháng đang xem cộng đệm 14 ngày mỗi đầu", () => {
    // Tháng 7/2026: 01/07 → 31/07.
    const { from, to } = getMonthFetchRange(2026, 6);

    expect(from).toBe("2026-06-17"); // 01/07 lùi 14 ngày
    expect(to).toBe("2026-08-14"); // 31/07 tiến 14 ngày
  });

  it("giữ khoảng đủ hẹp — không còn lùi 6 tháng", () => {
    const { from, to } = getMonthFetchRange(2026, 6);

    // 17/06 → 14/08 = 58 ngày. Bản cũ ~243 ngày → nhẹ hơn ~4 lần.
    expect(daysBetween(from, to)).toBe(58);
    expect(daysBetween(from, to)).toBeLessThan(70);
  });

  it("qua ranh giới năm vẫn đúng", () => {
    // Tháng 1/2026 → đệm lùi sang 12/2025.
    expect(getMonthFetchRange(2026, 0)).toEqual({
      from: "2025-12-18",
      to: "2026-02-14",
    });
    // Tháng 12/2026 → đệm tiến sang 1/2027.
    expect(getMonthFetchRange(2026, 11)).toEqual({
      from: "2026-11-17",
      to: "2027-01-14",
    });
  });

  // Lưới tháng vẽ 42 ô nên tràn sang tháng kề — tràn tối đa 6 ngày ở đầu và 14
  // ngày ở cuối. Đệm hụt thì ô ngoài rìa trống một cách khó hiểu.
  it("phủ trọn 42 ô của lưới tháng ở MỌI tháng 2024–2036", () => {
    for (let year = 2024; year <= 2036; year++) {
      for (let month = 0; month < 12; month++) {
        const firstOfMonth = new Date(year, month, 1);
        // Ô đầu lưới = lùi về thứ Hai/Chủ nhật đầu tuần chứa ngày 1.
        const gridStart = new Date(year, month, 1 - firstOfMonth.getDay());
        const gridEnd = new Date(gridStart);
        gridEnd.setDate(gridStart.getDate() + 41); // 42 ô

        const { from, to } = getMonthFetchRange(year, month);
        const fromMs = new Date(`${from}T00:00:00`).getTime();
        const toMs = new Date(`${to}T00:00:00`).getTime();

        expect(fromMs).toBeLessThanOrEqual(gridStart.getTime());
        expect(toMs).toBeGreaterThanOrEqual(gridEnd.getTime());
      }
    }
  });
});

describe("getWeekFetchRange", () => {
  it("phủ tuần đang xem cộng đệm 14 ngày mỗi đầu", () => {
    // Tuần 20/07 (T2) → 26/07 (CN) — đúng tuần user báo lỗi mất lịch CN.
    const weekDays = Array.from({ length: 7 }, (_, i) => new Date(2026, 6, 20 + i));

    expect(getWeekFetchRange(weekDays)).toEqual({
      from: "2026-07-06",
      to: "2026-08-09",
    });
  });

  it("trả null khi chưa dựng được ngày nào", () => {
    expect(getWeekFetchRange([])).toBeNull();
  });
});

describe("buildFetchRange", () => {
  it("không phụ thuộc múi giờ — dùng ngày LOCAL, không cắt chuỗi ISO", () => {
    // 23:30 local ngày 26 vẫn phải ra ngày 26, không trôi sang 27 (hoặc lùi 25).
    const late = new Date(2026, 6, 26, 23, 30);
    const { from, to } = buildFetchRange(late, late);

    expect(from).toBe("2026-07-12");
    expect(to).toBe("2026-08-09");
  });
});
