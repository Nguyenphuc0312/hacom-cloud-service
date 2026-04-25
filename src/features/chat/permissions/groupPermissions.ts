import { RoomMemberRole } from "../../../types";

export const canRenameGroup = (role: RoomMemberRole | null | undefined): boolean =>
  role === RoomMemberRole.OWNER || role === RoomMemberRole.ADMIN;

export const canAddGroupMembers = (role: RoomMemberRole | null | undefined): boolean =>
  role === RoomMemberRole.OWNER || role === RoomMemberRole.ADMIN;

export const canManageGroupAdmins = (role: RoomMemberRole | null | undefined): boolean =>
  role === RoomMemberRole.OWNER;

export const canRemoveGroupMember = (input: {
  actorRole: RoomMemberRole | null | undefined;
  actorUserId: string;
  targetRole: RoomMemberRole;
  targetUserId: string;
}): boolean => {
  const { actorRole, actorUserId, targetRole, targetUserId } = input;
  if (
    (actorRole !== RoomMemberRole.OWNER && actorRole !== RoomMemberRole.ADMIN) ||
    actorUserId === targetUserId ||
    targetRole === RoomMemberRole.OWNER
  ) {
    return false;
  }

  if (actorRole === RoomMemberRole.OWNER) {
    return true;
  }

  return targetRole !== RoomMemberRole.ADMIN;
};

export const canToggleAdminRole = (input: {
  actorRole: RoomMemberRole | null | undefined;
  actorUserId: string;
  targetRole: RoomMemberRole;
  targetUserId: string;
}): boolean => {
  const { actorRole, actorUserId, targetRole, targetUserId } = input;
  return (
    actorRole === RoomMemberRole.OWNER &&
    actorUserId !== targetUserId &&
    targetRole !== RoomMemberRole.OWNER
  );
};

export const canLeaveGroup = (
  role: RoomMemberRole | null | undefined,
  activeOwnerCount: number,
): boolean => {
  if (role !== RoomMemberRole.OWNER) {
    return true;
  }

  return activeOwnerCount > 1;
};

export const canDeleteConversationForSelf = (): boolean => true;
