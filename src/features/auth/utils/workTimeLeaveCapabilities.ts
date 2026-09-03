import type { User } from "../../../stores/authStore";

export const hasEffectivePermission = (
  user: User | null | undefined,
  permission: string,
): boolean => {
  const permissions = user?.permissions ?? [];
  return permissions.includes("*") || permissions.includes(permission);
};

export const canViewTeamTimesheet = (
  user: User | null | undefined,
): boolean => hasEffectivePermission(user, "hr.attendance.read");

export const canReviewAttendanceOnChat = (
  user: User | null | undefined,
): boolean =>
  hasEffectivePermission(user, "hr.attendance.read") &&
  hasEffectivePermission(user, "hr.attendance.update");

export const canApproveLeaveOnChat = (
  user: User | null | undefined,
): boolean => hasEffectivePermission(user, "hr.leave.approve");

export const canRejectLeaveOnChat = (
  user: User | null | undefined,
): boolean => hasEffectivePermission(user, "hr.leave.reject");

export const canReviewLeaveOnChat = (
  user: User | null | undefined,
): boolean =>
  canApproveLeaveOnChat(user) || canRejectLeaveOnChat(user);
