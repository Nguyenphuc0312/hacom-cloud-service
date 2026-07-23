import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { toast } from "../ui";
import { extractApiError, unwrapApiSuccess } from "../../lib/apiContract";
import { chatApi } from "../../features/chat/api/chatApi";
import { createSingleFlight } from "../../utils/singleFlight";
import { loadUserProfiles } from "../../services/userBatchLoader";
import { getUserDisplayName } from "../../utils/messageHelpers";
import { asStringValue as asString } from "../../utils/payloadGuards";
import { RoomMemberRole, UserStatus } from "../../types";
import type { UserSummary } from "../../types";

export type GroupMemberRole =
  | RoomMemberRole.OWNER
  | RoomMemberRole.ADMIN
  | RoomMemberRole.MEMBER;

export interface GroupMember {
  id: string;
  username: string;
  displayName?: string;
  fullNameFromHR?: string;
  full_name_from_hr?: string;
  employeeCode?: string;
  employee_code?: string;
  departmentName?: string;
  companyName?: string;
  avatar?: string;
  status?: UserSummary["status"];
  role: GroupMemberRole;
}

const ROLE_PRIORITY: Record<GroupMemberRole, number> = {
  [RoomMemberRole.OWNER]: 0,
  [RoomMemberRole.ADMIN]: 1,
  [RoomMemberRole.MEMBER]: 2,
};

const VALID_ROLES = new Set<string>([
  RoomMemberRole.OWNER,
  RoomMemberRole.ADMIN,
  RoomMemberRole.MEMBER,
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object";


const VALID_STATUSES = new Set<string>(Object.values(UserStatus));

const asStatus = (value: unknown): UserSummary["status"] | undefined => {
  const status = asString(value);
  if (!status) return undefined;
  return VALID_STATUSES.has(status)
    ? (status as UserSummary["status"])
    : undefined;
};

export const resolveMemberName = (
  member: Partial<UserSummary> | null | undefined,
): string => getUserDisplayName(member, { allowTechnicalFallback: true }) || "";

// Gộp các lần fetch trùng cho cùng một nhóm (refreshGroupState / bump version /
// remount chồng nhau dùng chung một request).
const groupMembersSingleFlight = createSingleFlight<
  Awaited<ReturnType<typeof chatApi.group.getMembers>>
>();

const extractMemberRows = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) return payload;
  if (isRecord(payload)) {
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.members)) return payload.members;
    if (isRecord(payload.data)) {
      const nested = payload.data;
      if (Array.isArray(nested.data)) return nested.data;
      if (Array.isArray(nested.members)) return nested.members;
    }
  }
  return [];
};

const normalizeMember = (raw: unknown): GroupMember | null => {
  if (!isRecord(raw)) return null;
  const user = isRecord(raw.user) ? raw.user : null;
  const id =
    asString(raw.userId) ??
    asString(raw.user_id) ??
    asString(user?.id) ??
    asString(raw.id);
  if (!id) return null;
  const roleRaw = asString(raw.role);
  const role = VALID_ROLES.has(roleRaw ?? "")
    ? (roleRaw as GroupMemberRole)
    : RoomMemberRole.MEMBER;
  const username =
    asString(raw.username) ??
    asString(user?.username) ??
    asString(raw.nickname) ??
    id;
  return {
    id,
    username,
    displayName: asString(raw.displayName) ?? asString(user?.displayName) ?? asString(raw.nickname),
    fullNameFromHR: asString(raw.fullNameFromHR) ?? asString(raw.full_name_from_hr) ?? asString(user?.fullNameFromHR) ?? asString(user?.full_name_from_hr),
    full_name_from_hr: asString(raw.full_name_from_hr) ?? asString(user?.full_name_from_hr) ?? asString(raw.fullNameFromHR) ?? asString(user?.fullNameFromHR),
    employeeCode: asString(raw.employeeCode) ?? asString(raw.employee_code) ?? asString(user?.employeeCode) ?? asString(user?.employee_code),
    employee_code: asString(raw.employee_code) ?? asString(user?.employee_code) ?? asString(raw.employeeCode) ?? asString(user?.employeeCode),
    departmentName: asString(raw.departmentName) ?? asString(raw.department_name) ?? asString(user?.departmentName) ?? asString(user?.department_name) ?? asString(user?.department),
    companyName: asString(raw.companyName) ?? asString(raw.company_name) ?? asString(user?.companyName) ?? asString(user?.company_name) ?? asString(user?.company) ?? asString(user?.orgUnit) ?? asString(user?.org_unit),
    avatar: asString(raw.avatar) ?? asString(user?.avatar),
    status: asStatus(raw.status) ?? asStatus(user?.status),
    role,
  };
};

/**
 * So sánh nông theo các trường ảnh hưởng hiển thị — dùng để giữ nguyên tham
 * chiếu cũ khi server trả về dữ liệu y hệt, tránh re-render cả panel.
 */
const areMemberMapsEqual = (
  previous: Record<string, GroupMember>,
  next: Record<string, GroupMember>,
): boolean => {
  const previousKeys = Object.keys(previous);
  const nextKeys = Object.keys(next);
  if (previousKeys.length !== nextKeys.length) return false;
  for (const key of previousKeys) {
    const prev = previous[key];
    const nextMember = next[key];
    if (!nextMember) return false;
    if (
      prev.id !== nextMember.id ||
      prev.username !== nextMember.username ||
      prev.displayName !== nextMember.displayName ||
      prev.avatar !== nextMember.avatar ||
      prev.status !== nextMember.status ||
      prev.role !== nextMember.role
    ) {
      return false;
    }
  }
  return true;
};

export interface GroupMembers {
  /** Danh sách đã gộp participants + members + HR, sắp theo vai trò rồi tên. */
  members: GroupMember[];
  /** Tra cứu O(1) theo id — dùng để lấy vai trò của người dùng hiện tại. */
  byUserId: Record<string, GroupMember>;
  isLoading: boolean;
  refetch: () => Promise<void>;
}

/**
 * Nguồn dữ liệu thành viên nhóm: tải danh sách, chuẩn hoá, bổ sung phòng ban /
 * công ty từ HR, rồi gộp với `participants` sẵn có của hội thoại.
 *
 * Chỉ lo DỮ LIỆU. Việc lọc/tìm/hiển thị bao nhiêu dòng thuộc về UI nên để lại
 * ở component.
 */
export const useGroupMembers = (
  conversationId: string,
  participants: UserSummary[],
  createdBy: string | undefined,
  memberListVersion: number,
): GroupMembers => {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [byUserId, setByUserId] = useState<Record<string, GroupMember>>({});
  const [hrByUserId, setHrByUserId] = useState<
    Record<string, { departmentName?: string; companyName?: string }>
  >({});

  const loadFailedMessage = t("profile:toast.loadMembersFailed");

  const refetch = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await groupMembersSingleFlight(conversationId, () =>
        chatApi.group.getMembers(conversationId, 1, 200),
      );
      const rows = extractMemberRows(unwrapApiSuccess(response));
      const nextById: Record<string, GroupMember> = {};
      rows.forEach((row) => {
        const member = normalizeMember(row);
        if (member) nextById[member.id] = member;
      });
      setByUserId((prev) =>
        areMemberMapsEqual(prev, nextById) ? prev : nextById,
      );
    } catch (error) {
      toast.error(extractApiError(error).message || loadFailedMessage);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, loadFailedMessage]);

  // Tải danh sách khi mở panel / đổi nhóm / có bump version từ realtime.
  // `refetch` là hàm async gọi API: setState chỉ chạy sau khi request xong, nên
  // đây không phải cascading render đồng bộ mà rule nhắm tới. Đồng bộ với dữ
  // liệu ngoài đúng là việc của effect.
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refetch();
  }, [refetch, memberListVersion]);

  const members = useMemo<GroupMember[]>(() => {
    const merged = new Map<string, GroupMember>();
    participants.forEach((participant) => {
      const existing = byUserId[participant.id];
      merged.set(participant.id, {
        id: participant.id,
        username: participant.username,
        displayName: participant.displayName,
        avatar: participant.avatar,
        status: participant.status,
        role:
          existing?.role ||
          (participant.id === createdBy
            ? RoomMemberRole.OWNER
            : RoomMemberRole.MEMBER),
      });
    });
    Object.values(byUserId).forEach((member) => {
      if (!merged.has(member.id)) merged.set(member.id, member);
    });

    return Array.from(merged.values())
      .map((member) => {
        const hr = hrByUserId[member.id];
        return {
          ...member,
          departmentName: member.departmentName ?? hr?.departmentName,
          companyName: member.companyName ?? hr?.companyName,
        };
      })
      .sort((a, b) => {
        const roleDiff = ROLE_PRIORITY[a.role] - ROLE_PRIORITY[b.role];
        if (roleDiff !== 0) return roleDiff;
        return resolveMemberName(a)
          .toLowerCase()
          .localeCompare(resolveMemberName(b).toLowerCase());
      });
  }, [byUserId, createdBy, hrByUserId, participants]);

  // Khoá dạng chuỗi để effect HR chỉ chạy lại khi TẬP id đổi, không phải mỗi
  // lần mảng participants có tham chiếu mới.
  const memberIdsKey = useMemo(
    () =>
      Array.from(
        new Set([...Object.keys(byUserId), ...participants.map((p) => p.id)]),
      )
        .sort()
        .join(","),
    [byUserId, participants],
  );

  React.useEffect(() => {
    const ids = memberIdsKey ? memberIdsKey.split(",") : [];
    if (ids.length === 0) return;
    let cancelled = false;

    void loadUserProfiles(ids).then((profileMap) => {
      if (cancelled) return;
      const resolved: Record<
        string,
        { departmentName?: string; companyName?: string }
      > = {};
      for (const [id, profile] of Object.entries(profileMap)) {
        if (!profile) continue;
        const p = profile as { department?: string | null; company?: string | null };
        if (p.department || p.company) {
          resolved[id] = {
            departmentName: p.department ?? undefined,
            companyName: p.company ?? undefined,
          };
        }
      }
      if (Object.keys(resolved).length > 0) {
        setHrByUserId((prev) => ({ ...prev, ...resolved }));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [memberIdsKey]);

  return { members, byUserId, isLoading, refetch };
};

export default useGroupMembers;
