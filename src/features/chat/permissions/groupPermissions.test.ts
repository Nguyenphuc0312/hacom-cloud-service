import { describe, expect, it } from "vitest";

import { RoomMemberRole } from "../../../types";
import {
  canAddGroupMembers,
  canDeleteConversationForSelf,
  canLeaveGroup,
  canRemoveGroupMember,
  canRenameGroup,
  canToggleAdminRole,
} from "./groupPermissions";

describe("groupPermissions", () => {
  it("allows rename and add member for owner/admin only", () => {
    expect(canRenameGroup(RoomMemberRole.OWNER)).toBe(true);
    expect(canRenameGroup(RoomMemberRole.ADMIN)).toBe(true);
    expect(canRenameGroup(RoomMemberRole.MEMBER)).toBe(false);

    expect(canAddGroupMembers(RoomMemberRole.OWNER)).toBe(true);
    expect(canAddGroupMembers(RoomMemberRole.ADMIN)).toBe(true);
    expect(canAddGroupMembers(RoomMemberRole.MEMBER)).toBe(false);
  });

  it("prevents admin from removing owner or other admins", () => {
    expect(
      canRemoveGroupMember({
        actorRole: RoomMemberRole.ADMIN,
        actorUserId: "admin-1",
        targetRole: RoomMemberRole.OWNER,
        targetUserId: "owner-1",
      }),
    ).toBe(false);

    expect(
      canRemoveGroupMember({
        actorRole: RoomMemberRole.ADMIN,
        actorUserId: "admin-1",
        targetRole: RoomMemberRole.ADMIN,
        targetUserId: "admin-2",
      }),
    ).toBe(false);

    expect(
      canRemoveGroupMember({
        actorRole: RoomMemberRole.ADMIN,
        actorUserId: "admin-1",
        targetRole: RoomMemberRole.MEMBER,
        targetUserId: "member-1",
      }),
    ).toBe(true);
  });

  it("allows only owner to toggle admin role", () => {
    expect(
      canToggleAdminRole({
        actorRole: RoomMemberRole.OWNER,
        actorUserId: "owner-1",
        targetRole: RoomMemberRole.MEMBER,
        targetUserId: "member-1",
      }),
    ).toBe(true);

    expect(
      canToggleAdminRole({
        actorRole: RoomMemberRole.ADMIN,
        actorUserId: "admin-1",
        targetRole: RoomMemberRole.MEMBER,
        targetUserId: "member-1",
      }),
    ).toBe(false);
  });

  it("blocks last owner from leaving and always allows delete-for-self", () => {
    expect(canLeaveGroup(RoomMemberRole.OWNER, 1)).toBe(false);
    expect(canLeaveGroup(RoomMemberRole.OWNER, 2)).toBe(true);
    expect(canLeaveGroup(RoomMemberRole.ADMIN, 1)).toBe(true);
    expect(canLeaveGroup(RoomMemberRole.MEMBER, 1)).toBe(true);
    expect(canDeleteConversationForSelf()).toBe(true);
  });
});
