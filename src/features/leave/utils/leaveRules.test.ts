import { describe, expect, it } from "vitest";
import {
  collectBlockingIssues,
  needsSickAttachmentHint,
  getNoticeRequiredDays,
  getNoticeStatus,
  isBeforeRetroactiveLimit,
  isInvalidHalfDayRange,
} from "./leaveRules";

/** 10/08/2026 làm "hôm nay" cố định để test không phụ thuộc ngày chạy. */
const TODAY = Date.UTC(2026, 7, 10);

describe("getNoticeRequiredDays", () => {
  it("bám đúng bậc thang của BE, kể cả tại mốc biên", () => {
    expect(getNoticeRequiredDays(1)).toBe(1);
    expect(getNoticeRequiredDays(3)).toBe(1);
    expect(getNoticeRequiredDays(4)).toBe(3);
    expect(getNoticeRequiredDays(10)).toBe(3);
    expect(getNoticeRequiredDays(11)).toBe(7);
  });
});

describe("getNoticeStatus", () => {
  it("nghỉ 1 ngày báo trước đúng 1 ngày thì không muộn", () => {
    const status = getNoticeStatus("2026-08-11", 1, TODAY);
    expect(status).toEqual({ requiredDays: 1, actualDays: 1, lateSubmission: false });
  });

  it("xin nghỉ ngay hôm nay là báo muộn", () => {
    expect(getNoticeStatus("2026-08-10", 1, TODAY)?.lateSubmission).toBe(true);
  });

  it("nghỉ dài 11 ngày cần báo trước 7 ngày", () => {
    expect(getNoticeStatus("2026-08-14", 11, TODAY)).toMatchObject({
      requiredDays: 7,
      actualDays: 4,
      lateSubmission: true,
    });
    expect(getNoticeStatus("2026-08-17", 11, TODAY)?.lateSubmission).toBe(false);
  });

  it("ngày sai định dạng hoặc chưa có số ngày thì không kết luận gì", () => {
    expect(getNoticeStatus("khong-phai-ngay", 1, TODAY)).toBeNull();
    expect(getNoticeStatus("2026-08-11", 0, TODAY)).toBeNull();
  });
});

describe("isBeforeRetroactiveLimit", () => {
  it("đúng mốc 3 ngày vẫn cho, ngày thứ 4 mới chặn", () => {
    expect(isBeforeRetroactiveLimit("2026-08-07", TODAY)).toBe(false);
    expect(isBeforeRetroactiveLimit("2026-08-06", TODAY)).toBe(true);
  });

  it("ngày tương lai không bao giờ bị chặn", () => {
    expect(isBeforeRetroactiveLimit("2026-09-01", TODAY)).toBe(false);
  });
});

describe("isInvalidHalfDayRange", () => {
  it("chỉ ngược khi CÙNG ngày và Chiều → Sáng", () => {
    expect(isInvalidHalfDayRange("2026-08-11", "2026-08-11", "PM", "AM")).toBe(true);
    expect(isInvalidHalfDayRange("2026-08-11", "2026-08-11", "AM", "PM")).toBe(false);
    // Khác ngày thì Chiều → Sáng là hợp lệ (nghỉ chiều nay tới sáng mai).
    expect(isInvalidHalfDayRange("2026-08-11", "2026-08-12", "PM", "AM")).toBe(false);
  });
});

describe("collectBlockingIssues", () => {
  const base = {
    startDate: "2026-08-11",
    endDate: "2026-08-11",
    startPortion: "FULL" as const,
    endPortion: "FULL" as const,
    totalDays: 1,
    leaveType: "ANNUAL",
    attachmentUrl: "",
    now: TODAY,
  };

  it("đơn hợp lệ thì không có lỗi nào", () => {
    expect(collectBlockingIssues(base)).toEqual([]);
  });

  it("gom được nhiều lỗi cùng lúc", () => {
    const issues = collectBlockingIssues({
      ...base,
      startDate: "2026-08-01",
      endDate: "2026-08-01",
      startPortion: "PM",
      endPortion: "AM",
      leaveType: "SICK",
      totalDays: 3,
    });
    expect(issues.map((i) => i.code)).toEqual([
      "INVALID_HALF_DAY_SESSION_RANGE",
      "RETROACTIVE_LEAVE_LIMIT_EXCEEDED",
    ]);
  });

  it("thiếu chứng từ nghỉ ốm KHÔNG còn chặn — số ngày FE chỉ là ước lượng", () => {
    const issues = collectBlockingIssues({ ...base, leaveType: "SICK", totalDays: 3 });
    expect(issues).toEqual([]);
  });
});

describe("needsSickAttachmentHint", () => {
  it("nghỉ ốm từ 3 ngày mà thiếu chứng từ thì nhắc", () => {
    expect(
      needsSickAttachmentHint({ leaveType: "SICK", estimatedDays: 3, attachmentUrl: "" }),
    ).toBe(true);
  });

  it("có chứng từ rồi thì thôi nhắc", () => {
    expect(
      needsSickAttachmentHint({
        leaveType: "SICK",
        estimatedDays: 3,
        attachmentUrl: "https://example.com/giay-kham.pdf",
      }),
    ).toBe(false);
  });

  it("khoảng trắng không tính là đã đính kèm chứng từ", () => {
    expect(
      needsSickAttachmentHint({ leaveType: "SICK", estimatedDays: 3, attachmentUrl: "   " }),
    ).toBe(true);
  });

  it("dưới 3 ngày hoặc loại nghỉ khác thì không nhắc", () => {
    expect(
      needsSickAttachmentHint({ leaveType: "SICK", estimatedDays: 2, attachmentUrl: "" }),
    ).toBe(false);
    expect(
      needsSickAttachmentHint({ leaveType: "ANNUAL", estimatedDays: 5, attachmentUrl: "" }),
    ).toBe(false);
  });
});
