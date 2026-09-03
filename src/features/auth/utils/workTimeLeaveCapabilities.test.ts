import { describe, expect, it } from "vitest";

import type { User } from "../../../stores/authStore";
import {
  canApproveLeaveOnChat,
  canRejectLeaveOnChat,
  canReviewAttendanceOnChat,
  canReviewLeaveOnChat,
  canViewTeamTimesheet,
} from "./workTimeLeaveCapabilities";

const user = (permissions: string[], roles = ["EMPLOYEE"]) =>
  ({ id: "user-1", username: "tester", permissions, roles }) as User;

describe("work-time-leave capabilities", () => {
  it("uses effective permissions instead of role names", () => {
    expect(
      canReviewAttendanceOnChat(
        user(["hr.attendance.read", "hr.attendance.update"], ["UNIT_HR"]),
      ),
    ).toBe(true);
    expect(canReviewAttendanceOnChat(user([], ["SUPER_ADMIN"]))).toBe(false);
  });

  it("requires read and update together for attendance review", () => {
    expect(canReviewAttendanceOnChat(user(["hr.attendance.read"]))).toBe(
      false,
    );
    expect(canViewTeamTimesheet(user(["hr.attendance.read"]))).toBe(true);
  });

  it("keeps leave approve and reject actions independent", () => {
    const approveOnly = user(["hr.leave.approve"]);
    expect(canReviewLeaveOnChat(approveOnly)).toBe(true);
    expect(canApproveLeaveOnChat(approveOnly)).toBe(true);
    expect(canRejectLeaveOnChat(approveOnly)).toBe(false);
  });

  it("accepts the canonical wildcard permission", () => {
    const wildcard = user(["*"]);
    expect(canReviewAttendanceOnChat(wildcard)).toBe(true);
    expect(canApproveLeaveOnChat(wildcard)).toBe(true);
    expect(canRejectLeaveOnChat(wildcard)).toBe(true);
  });
});
