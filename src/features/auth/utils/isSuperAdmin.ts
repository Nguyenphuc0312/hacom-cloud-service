import type { User } from "../../../stores/authStore";

const canonicalRole = (role: string) =>
  role.trim().toUpperCase().replace(/[\s-]+/g, "_");

/**
 * Tạm khóa các hộp duyệt nhúng trong Chat cho Super Admin. HRM vẫn kiểm tra
 * quyền nghiệp vụ riêng tại API; helper này chỉ điều khiển bề mặt Chat.
 */
export function isSuperAdmin(user: User | null | undefined): boolean {
  const roles = [...(user?.roles ?? []), ...(user?.role ? [user.role] : [])];
  return roles.some((role) => canonicalRole(role) === "SUPER_ADMIN");
}
