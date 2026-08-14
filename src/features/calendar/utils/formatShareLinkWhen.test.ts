import { describe, expect, it } from "vitest";

import { formatShareLinkWhen } from "./formatShareLinkWhen";

/**
 * Test này phải cho KẾT QUẢ GIỐNG NHAU ở mọi múi giờ máy chạy.
 *
 * Bản cũ ghim offset +07:00 ở INPUT rồi kỳ vọng "16:30", tưởng là đủ — nhưng
 * hàm format lại render theo múi giờ MÁY, nên chạy trên CI đặt UTC ra "09:30"
 * và test đỏ oan. Cách đúng: truyền `timeZone` tường minh vào hàm và kỳ vọng
 * theo đúng múi giờ đó.
 */
const VN = "Asia/Ho_Chi_Minh";
const START = "2026-07-28T16:30:00+07:00"; // 16:30 giờ VN
const END = "2026-07-28T18:00:00+07:00"; // 18:00 giờ VN

describe("formatShareLinkWhen", () => {
  it("gộp ngày + khoảng giờ cho lịch có giờ cụ thể", () => {
    const text = formatShareLinkWhen(START, END, false, VN);
    // Ngày hiển thị cho người dùng luôn là dd/mm/yyyy.
    expect(text).toContain("28/07/2026");
    expect(text).toContain("—");
    expect(text).toMatch(/16.30/);
    expect(text).toMatch(/18.00/);
  });

  it("lịch cả ngày thì bỏ hẳn phần giờ", () => {
    const text = formatShareLinkWhen(START, END, true, VN);
    expect(text).toContain("Cả ngày");
    expect(text).not.toMatch(/16.30/);
  });

  it("endAt hỏng thì vẫn hiện được giờ bắt đầu, không in Invalid Date", () => {
    const text = formatShareLinkWhen(START, "not-a-date", false, VN);
    expect(text).toMatch(/16.30/);
    expect(text).not.toContain("Invalid");
    expect(text).not.toContain("—");
  });

  it("startAt hỏng thì trả rỗng để UI tự ẩn dòng", () => {
    expect(formatShareLinkWhen("not-a-date", END, false, VN)).toBe("");
  });

  it("không truyền timeZone thì dùng giờ VN, KHÔNG dùng giờ máy", () => {
    // Đây là ca khiến CI đỏ trước đây: máy UTC sẽ ra 09:30 nếu còn dùng giờ máy.
    const text = formatShareLinkWhen(START, END, false);
    expect(text).toContain("28/07/2026");
    expect(text).toMatch(/16.30/);
    expect(text).toMatch(/18.00/);
  });

  it("cùng một mốc, đổi timeZone thì đổi giờ hiển thị", () => {
    // 16:30 giờ VN = 09:30 UTC = 18:30 giờ Tokyo (+09).
    expect(formatShareLinkWhen(START, END, false, "UTC")).toMatch(/09.30/);
    expect(formatShareLinkWhen(START, END, false, "Asia/Tokyo")).toMatch(/18.30/);
  });

  it("vắt qua nửa đêm thì NGÀY cũng đổi theo múi giờ, không chỉ giờ", () => {
    // 23:30 giờ VN ngày 28/07 = 16:30 UTC cùng ngày, nhưng ở Tokyo đã sang 29/07.
    const lateStart = "2026-07-28T23:30:00+07:00";
    const lateEnd = "2026-07-29T00:30:00+07:00";

    expect(formatShareLinkWhen(lateStart, lateEnd, false, VN)).toContain(
      "28/07/2026",
    );
    expect(formatShareLinkWhen(lateStart, lateEnd, false, "Asia/Tokyo")).toContain(
      "29/07/2026",
    );
  });

  it("timeZone rác thì rơi về giờ VN thay vì làm vỡ màn hình", () => {
    const text = formatShareLinkWhen(START, END, false, "Khong/Ton_Tai");
    expect(text).toContain("28/07/2026");
    expect(text).toMatch(/16.30/);
  });

  it("nửa đêm hiện 00:00 chứ không phải 24:00", () => {
    const midnight = "2026-07-28T00:00:00+07:00";
    expect(formatShareLinkWhen(midnight, END, false, VN)).toMatch(/00.00/);
  });
});
