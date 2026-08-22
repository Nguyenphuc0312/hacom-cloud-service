const LEAVE_DURATION_ERROR_MESSAGES: Record<string, string> = {
  LEAVE_TOTAL_DAYS_MISMATCH:
    "Số ngày nghỉ do hệ thống tính lại không khớp với số đang hiển thị. Vui lòng tải lại trang và gửi lại đơn.",
  LEAVE_DURATION_SCHEDULE_UNASSIGNED:
    "Chưa có lịch làm việc hoặc phân ca hiệu lực cho ngày nghỉ. Vui lòng liên hệ HR để được phân ca trước khi gửi đơn.",
  LEAVE_DURATION_NO_WORKING_DAY:
    "Khoảng thời gian đã chọn không có ngày làm việc theo lịch. Vui lòng chọn lại ngày nghỉ.",
  LEAVE_DURATION_DATE_INVALID:
    "Ngày nghỉ không hợp lệ. Vui lòng kiểm tra lại ngày bắt đầu và ngày kết thúc.",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringsFrom(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return [];
}

/**
 * Maps only server-side leave-duration validation codes. Unknown errors retain
 * the existing page fallback so no API detail is accidentally exposed.
 */
export function getLeaveDurationErrorMessage(error: unknown): string | null {
  const candidates: string[] = [];

  if (error instanceof Error) candidates.push(error.message);
  if (isRecord(error)) {
    candidates.push(...stringsFrom(error.errorCode));
    candidates.push(...stringsFrom(error.code));
    candidates.push(...stringsFrom(error.message));
    candidates.push(...stringsFrom(error.errors));

    const response = isRecord(error.response) ? error.response : null;
    const data = response && isRecord(response.data) ? response.data : null;
    if (data) {
      candidates.push(...stringsFrom(data.errorCode));
      candidates.push(...stringsFrom(data.code));
      candidates.push(...stringsFrom(data.message));
      candidates.push(...stringsFrom(data.errors));
    }
  }

  for (const [errorCode, message] of Object.entries(LEAVE_DURATION_ERROR_MESSAGES)) {
    if (candidates.some((candidate) => candidate.includes(errorCode))) {
      return message;
    }
  }

  return null;
}
