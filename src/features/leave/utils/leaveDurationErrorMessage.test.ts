import { describe, expect, it } from "vitest";

import { getLeaveDurationErrorMessage } from "./leaveDurationErrorMessage";

describe("getLeaveDurationErrorMessage", () => {
  it("maps every new leave-duration validation code", () => {
    expect(
      getLeaveDurationErrorMessage({ errorCode: "LEAVE_TOTAL_DAYS_MISMATCH" }),
    ).toContain("hệ thống tính lại không khớp");
    expect(
      getLeaveDurationErrorMessage({
        response: { data: { message: "LEAVE_DURATION_SCHEDULE_UNASSIGNED" } },
      }),
    ).toContain("liên hệ HR");
    expect(
      getLeaveDurationErrorMessage({ message: ["LEAVE_DURATION_NO_WORKING_DAY"] }),
    ).toContain("không có ngày làm việc");
    expect(
      getLeaveDurationErrorMessage(new Error("LEAVE_DURATION_DATE_INVALID")),
    ).toContain("Ngày nghỉ không hợp lệ");
  });

  it("leaves unknown errors on the existing fallback path", () => {
    expect(getLeaveDurationErrorMessage({ errorCode: "UNKNOWN_ERROR" })).toBeNull();
  });
});
