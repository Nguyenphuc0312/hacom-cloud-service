/**
 * Permission check utilities for group member actions.
 * Centralized permission logic following the Slack/Discord/Telegram pattern.
 */

import { RoomMemberRole } from "../../../../../types";

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

export type MemberAction =
  | "make-admin"
  | "remove-admin"
  | "transfer-ownership"
  | "ban-member"
  | "remove-member";

export interface MemberActionContext {
  actorRole: RoomMemberRole;
  actorUserId: string;
  targetRole: RoomMemberRole;
  targetUserId: string;
  capabilities?: GroupCapabilityMatrix | null;
}

function canToggleAdminRole(input: MemberActionContext): boolean {
  const { actorRole, actorUserId, targetRole, targetUserId, capabilities } = input;

  // Check explicit capability first
  if (targetRole === RoomMemberRole.ADMIN) {
    if (capabilities?.canDemoteAdmin === false) return false;
  } else {
    if (capabilities?.canPromoteMember === false) return false;
  }

  // Owner can toggle anyone except themselves and other owners
  return (
    actorRole === RoomMemberRole.OWNER &&
    actorUserId !== targetUserId &&
    targetRole !== RoomMemberRole.OWNER
  );
}

function canRemoveMember(input: MemberActionContext): boolean {
  const { actorRole, actorUserId, targetRole, targetUserId, capabilities } = input;

  // Check explicit capability first
  if (capabilities?.canRemoveMember === false) return false;

  // Can't remove self
  if (actorUserId === targetUserId) return false;

  // Can't remove owner
  if (targetRole === RoomMemberRole.OWNER) return false;

  // Owner can remove anyone
  if (actorRole === RoomMemberRole.OWNER) return true;

  // Admin can remove members only (not other admins)
  if (actorRole === RoomMemberRole.ADMIN) {
    return targetRole !== RoomMemberRole.ADMIN;
  }

  return false;
}

function canTransferOwnership(input: MemberActionContext): boolean {
  const { actorRole, actorUserId, targetRole, targetUserId } = input;

  // Only owner can transfer ownership
  if (actorRole !== RoomMemberRole.OWNER) return false;

  // Can't transfer to self
  if (actorUserId === targetUserId) return false;

  // Can't transfer to another owner
  if (targetRole === RoomMemberRole.OWNER) return false;

  return true;
}

function canBanMember(input: MemberActionContext): boolean {
  const { actorRole, targetRole } = input;

  // Owner and admin can ban
  if (actorRole !== RoomMemberRole.OWNER && actorRole !== RoomMemberRole.ADMIN) {
    return false;
  }

  // Can't ban owner
  if (targetRole === RoomMemberRole.OWNER) return false;

  return true;
}

export interface ActionLabels {
  makeAdmin: string;
  removeAdmin: string;
  transferOwnership: string;
  banMember: string;
  removeMember: string;
}

export interface ResolvedMemberAction {
  id: string;
  type: MemberAction;
  label: string;
  variant: "neutral" | "warning" | "danger";
}

export function getMemberActions(
  context: MemberActionContext,
  labels: ActionLabels,
): ResolvedMemberAction[] {
  const actions: ResolvedMemberAction[] = [];

  // Can't perform any action on self
  if (context.actorUserId === context.targetUserId) {
    return actions;
  }

  // Toggle admin role
  if (canToggleAdminRole(context)) {
    if (context.targetRole === RoomMemberRole.ADMIN) {
      actions.push({
        id: "remove-admin",
        type: "remove-admin",
        label: labels.removeAdmin,
        variant: "neutral",
      });
    } else {
      actions.push({
        id: "make-admin",
        type: "make-admin",
        label: labels.makeAdmin,
        variant: "neutral",
      });
    }
  }

  // Transfer ownership (only from owner, not to owner)
  if (canTransferOwnership(context)) {
    actions.push({
      id: "transfer-ownership",
      type: "transfer-ownership",
      label: labels.transferOwnership,
      variant: "warning",
    });
  }

  // Ban member
  if (canBanMember(context)) {
    actions.push({
      id: "ban-member",
      type: "ban-member",
      label: labels.banMember,
      variant: "warning",
    });
  }

  // Remove member
  if (canRemoveMember(context)) {
    actions.push({
      id: "remove-member",
      type: "remove-member",
      label: labels.removeMember,
      variant: "danger",
    });
  }

  return actions;
}
