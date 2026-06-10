import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { MemberRow } from "./MemberRow";
import { DirectorySkeleton } from "../../../../components/ui/Skeleton";
import { RoomMemberRole } from "../../../../types";
import type { UserStatus } from "../../../../types";
import type { GroupCapabilityMatrix } from "./utils/canPerformAction";

interface GroupMember {
  id: string;
  username: string;
  displayName?: string;
  fullNameFromHR?: string;
  avatar?: string;
  status?: UserStatus;
  role: RoomMemberRole;
}

interface MembersListProps {
  members: GroupMember[];
  isLoading: boolean;
  currentUserId: string;
  currentUserRole: RoomMemberRole;
  capabilities?: GroupCapabilityMatrix | null;
  actingMemberId: string | null;
  onMakeAdmin: (memberId: string) => void;
  onRemoveAdmin: (memberId: string) => void;
  onTransferOwnership: (memberId: string) => void;
  onBanMember: (memberId: string) => void;
  onRemoveMember: (memberId: string) => void;
  onMemberClick?: (memberId: string) => void;
  className?: string;
}

const ROLE_PRIORITY: Record<RoomMemberRole, number> = {
  [RoomMemberRole.OWNER]: 0,
  [RoomMemberRole.ADMIN]: 1,
  [RoomMemberRole.MODERATOR]: 2,
  [RoomMemberRole.MEMBER]: 3,
  [RoomMemberRole.RESTRICTED]: 4,
  [RoomMemberRole.BANNED]: 5,
};

export const MembersList: React.FC<MembersListProps> = ({
  members,
  isLoading,
  currentUserId,
  currentUserRole,
  capabilities,
  actingMemberId,
  onMakeAdmin,
  onRemoveAdmin,
  onTransferOwnership,
  onBanMember,
  onRemoveMember,
  onMemberClick,
  className,
}) => {
  const { t } = useTranslation("profile");

  // Sort members: owner first, then admin, then by name
  const sortedMembers = React.useMemo(() => {
    return [...members].sort((a, b) => {
      const roleDiff = ROLE_PRIORITY[a.role] - ROLE_PRIORITY[b.role];
      if (roleDiff !== 0) return roleDiff;

      const aName = (a.fullNameFromHR || a.displayName || a.username || "").toLowerCase();
      const bName = (b.fullNameFromHR || b.displayName || b.username || "").toLowerCase();
      return aName.localeCompare(bName);
    });
  }, [members]);

  if (isLoading) {
    return <DirectorySkeleton count={5} />;
  }

  if (members.length === 0) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-sm text-text-muted">
          {t("profile:groupInfo.noMembers")}
        </p>
      </div>
    );
  }

  return (
    <div className={clsx("divide-y divide-border/60", className)}>
      {sortedMembers.map((member) => (
        <MemberRow
          key={member.id}
          memberId={member.id}
          username={member.username}
          displayName={member.displayName}
          fullNameFromHR={member.fullNameFromHR}
          avatar={member.avatar}
          status={member.status}
          role={member.role}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          capabilities={capabilities}
          onMakeAdmin={onMakeAdmin}
          onRemoveAdmin={onRemoveAdmin}
          onTransferOwnership={onTransferOwnership}
          onBanMember={onBanMember}
          onRemoveMember={onRemoveMember}
          onMemberClick={onMemberClick}
          isLoading={actingMemberId === member.id}
        />
      ))}
    </div>
  );
};
