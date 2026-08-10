import type { LeaveDayPortion } from "./leaveDays";

/**
 * Luật đơn nghỉ phép — bản sao FE của hr-api-service `leave.service.ts`.
 *
 * Mục đích: nói cho người dùng biết SỚM thay vì để họ bấm "Gửi đơn" rồi hứng
 * lỗi từ server. BE vẫn là nơi phán quyết cuối; đây chỉ là lớp báo trước, nên
 * mọi hằng số dưới đây phải khớp BE — lệch là FE chặn oan hoặc bỏ lọt.
 */

/** BE: `retroactiveLeaveLimitDays = 3` */
export const RETROACTIVE_LIMIT_DAYS = 3;

/** BE: `leaveType === SICK && totalDays >= 3 && !attachmentUrl` */
export const SICK_ATTACHMENT_MIN_DAYS = 3;

const MS_PER_DAY = 86_400_000;

const parseDateOnly = (value: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(date.getTime()) ? null : date;
};

/** Mốc 00:00 UTC của một ngày — so ngày với ngày, bỏ qua giờ. */
const dateOnlyUtc = (value: Date) =>
  Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());

const todayUtc = () => {
  const now = new Date();
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
};

/** BE `getNoticeRequiredDays`: nghỉ càng dài càng phải báo sớm. */
export const getNoticeRequiredDays = (totalDays: number): number => {
  if (totalDays <= 3) return 1;
  if (totalDays <= 10) return 3;
  return 7;
};

export type NoticeStatus = {
  requiredDays: number;
  actualDays: number;
  lateSubmission: boolean;
};

/**
 * BE `buildNoticeWarning`. Nghỉ báo muộn KHÔNG bị từ chối — BE chỉ gắn cờ
 * `lateSubmission` để người duyệt thấy. Nên đây là cảnh báo, không phải lỗi.
 */
export const getNoticeStatus = (
  startDate: string,
  totalDays: number,
  now: number = todayUtc(),
): NoticeStatus | null => {
  const start = parseDateOnly(startDate);
  if (!start || totalDays <= 0) return null;

  const requiredDays = getNoticeRequiredDays(totalDays);
  const actualDays = Math.floor((dateOnlyUtc(start) - now) / MS_PER_DAY);

  return { requiredDays, actualDays, lateSubmission: actualDays < requiredDays };
};

/** BE `isBeforeRetroactiveLimit` → ném RETROACTIVE_LEAVE_LIMIT_EXCEEDED. */
export const isBeforeRetroactiveLimit = (
  startDate: string,
  now: number = todayUtc(),
): boolean => {
  const start = parseDateOnly(startDate);
  if (!start) return false;
  return dateOnlyUtc(start) < now - RETROACTIVE_LIMIT_DAYS * MS_PER_DAY;
};

/**
 * BE `INVALID_HALF_DAY_SESSION_RANGE`: cùng một ngày mà bắt đầu từ buổi chiều
 * rồi kết thúc ở buổi sáng thì khoảng nghỉ chạy ngược.
 */
export const isInvalidHalfDayRange = (
  startDate: string,
  endDate: string,
  startPortion: LeaveDayPortion,
  endPortion: LeaveDayPortion,
): boolean =>
  startDate === endDate && startPortion === "PM" && endPortion === "AM";

export type LeaveFormIssue = { code: string; message: string };

/**
 * Gom mọi lỗi CHẶN gửi đơn (BE sẽ ném lỗi nếu lọt qua). Báo trước muộn không
 * nằm ở đây vì nó chỉ là cảnh báo.
 */
export const collectBlockingIssues = (input: {
  startDate: string;
  endDate: string;
  startPortion: LeaveDayPortion;
  endPortion: LeaveDayPortion;
  totalDays: number;
  leaveType: string;
  attachmentUrl: string;
  now?: number;
}): LeaveFormIssue[] => {
  const issues: LeaveFormIssue[] = [];

  if (isInvalidHalfDayRange(input.startDate, input.endDate, input.startPortion, input.endPortion)) {
    issues.push({
      code: "INVALID_HALF_DAY_SESSION_RANGE",
      message: "Trong cùng một ngày, không thể nghỉ từ buổi chiều đến buổi sáng.",
    });
  }

  if (isBeforeRetroactiveLimit(input.startDate, input.now)) {
    issues.push({
      code: "RETROACTIVE_LEAVE_LIMIT_EXCEEDED",
      message: `Chỉ được khai lùi tối đa ${RETROACTIVE_LIMIT_DAYS} ngày. Nghỉ xa hơn cần HR nhập giúp.`,
    });
  }

  if (
    input.leaveType === "SICK" &&
    input.totalDays >= SICK_ATTACHMENT_MIN_DAYS &&
    !input.attachmentUrl.trim()
  ) {
    issues.push({
      code: "SICK_LEAVE_ATTACHMENT_REQUIRED",
      message: `Nghỉ ốm từ ${SICK_ATTACHMENT_MIN_DAYS} ngày phải có chứng từ đính kèm.`,
    });
  }

  return issues;
};
