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

/**
 * BE: `leaveType === SICK && derived.totalDays >= 3 && !attachmentUrl`.
 *
 * ⚠️ BE so với số ngày **server tự tính theo ca**, không phải số ngày lịch.
 * FE chỉ ước lượng được nên có thể nhắc chứng từ sớm hơn/muộn hơn một chút;
 * đây là nhắc trước, BE vẫn là nơi chặn thật.
 */
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
 * Gom các lỗi CHẶN mà FE tự khẳng định được **không cần biết lịch làm việc**:
 * khoảng ngày chạy ngược và khai lùi quá hạn. Hai thứ này chỉ phụ thuộc ngày
 * tháng nên FE kết luận được chắc chắn.
 *
 * `SICK_LEAVE_ATTACHMENT_REQUIRED` dựa trên số ngày ước lượng nên là cảnh báo
 * mềm, KHÔNG chặn nút gửi — nếu chặn theo số ngày lịch, người nghỉ ốm Thứ 6 →
 * Thứ 2 (server tính 2 ngày) sẽ bị đòi chứng từ oan.
 *
 * Báo trước muộn cũng không nằm ở đây vì BE chỉ gắn cờ, không từ chối.
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

  return issues;
};

/**
 * Nhắc chứng từ nghỉ ốm — CẢNH BÁO, không chặn. Số ngày đưa vào đây là ước
 * lượng theo lịch nên có thể lớn hơn số ngày server tính; chặn cứng theo nó sẽ
 * đòi chứng từ oan. BE mới là nơi chặn thật (`SICK_LEAVE_ATTACHMENT_REQUIRED`).
 */
export const needsSickAttachmentHint = (input: {
  leaveType: string;
  estimatedDays: number;
  attachmentUrl: string;
}): boolean =>
  input.leaveType === "SICK" &&
  input.estimatedDays >= SICK_ATTACHMENT_MIN_DAYS &&
  !input.attachmentUrl.trim();
