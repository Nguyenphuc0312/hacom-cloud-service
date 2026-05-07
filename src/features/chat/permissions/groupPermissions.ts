import { RoomMemberRole } from "../../../types";

export type GroupCapabilityMatrix = {
  canEditGroupProfile?: boolean;
  canAddMember?: boolean;
  canRemoveMember?: boolean;
  canPromoteMember?: boolean;
  canDemoteAdmin?: boolean;
  canTransferOwner?: boolean;
  canLeaveGroup?: boolean;
  canDeleteGroup?: boolean;
  canPinMessage?: boolean;
  canInviteExternal?: boolean;
  canViewHistory?: boolean;
  canAccessFile?: boolean;
  canSendMessage?: boolean;
};

const fromCapability = (
  capabilities: GroupCapabilityMatrix | null | undefined,
  key: keyof GroupCapabilityMatrix,
): boolean | null =>
  typeof capabilities?.[key] === "boolean" ? Boolean(capabilities[key]) : null;

export const canRenameGroup = (
  role: RoomMemberRole | null | undefined,
  capabilities?: GroupCapabilityMatrix | null,
): boolean =>
  fromCapability(capabilities, "canEditGroupProfile") ??
  (role === RoomMemberRole.OWNER || role === RoomMemberRole.ADMIN);

export const canAddGroupMembers = (
  role: RoomMemberRole | null | undefined,
  capabilities?: GroupCapabilityMatrix | null,
): boolean =>
  fromCapability(capabilities, "canAddMember") ??
  (role === RoomMemberRole.OWNER || role === RoomMemberRole.ADMIN);

export const canManageGroupAdmins = (role: RoomMemberRole | null | undefined): boolean =>
  role === RoomMemberRole.OWNER;

export const canRemoveGroupMember = (input: {
  actorRole: RoomMemberRole | null | undefined;
  actorUserId: string;
  targetRole: RoomMemberRole;
  targetUserId: string;
  capabilities?: GroupCapabilityMatrix | null;
}): boolean => {
  const { actorRole, actorUserId, targetRole, targetUserId, capabilities } = input;
  const capability = fromCapability(capabilities, "canRemoveMember");
  if (capability === false) {
    return false;
  }
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
  capabilities?: GroupCapabilityMatrix | null;
}): boolean => {
  const { actorRole, actorUserId, targetRole, targetUserId, capabilities } = input;
  const roleCapability =
    targetRole === RoomMemberRole.ADMIN
      ? fromCapability(capabilities, "canDemoteAdmin")
      : fromCapability(capabilities, "canPromoteMember");
  if (roleCapability === false) {
    return false;
  }

  return (
    actorRole === RoomMemberRole.OWNER &&
    actorUserId !== targetUserId &&
    targetRole !== RoomMemberRole.OWNER
  );
};

export const canLeaveGroup = (
  role: RoomMemberRole | null | undefined,
  activeOwnerCount: number,
  capabilities?: GroupCapabilityMatrix | null,
): boolean => {
  const capability = fromCapability(capabilities, "canLeaveGroup");
  if (capability !== null) {
    return capability;
  }

  if (role !== RoomMemberRole.OWNER) {
    return true;
  }

  return activeOwnerCount > 1;
};

export const canDeleteConversationForSelf = (): boolean => true;
