import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Avatar } from "../../../../components/common/Avatar";
import { MemberRoleBadge } from "./MemberRoleBadge";
import { MemberActionsMenu } from "./MemberActionsMenu";
import { resolveDisplayName } from "./utils/resolveDisplayName";
import { RoomMemberRole } from "../../../../types";
import type { UserStatus } from "../../../../types";
import type { GroupCapabilityMatrix } from "./utils/canPerformAction";

interface MemberRowProps {
  memberId: string;
  username: string;
  displayName?: string;
  fullNameFromHR?: string;
  avatar?: string;
  status?: UserStatus;
  role: RoomMemberRole;
  currentUserId: string;
  currentUserRole: RoomMemberRole;
  capabilities?: GroupCapabilityMatrix | null;
  onMakeAdmin: (memberId: string) => void;
  onRemoveAdmin: (memberId: string) => void;
  onTransferOwnership: (memberId: string) => void;
  onBanMember: (memberId: string) => void;
  onRemoveMember: (memberId: string) => void;
  isLoading?: boolean;
  isMobile?: boolean;
  className?: string;
}

export const MemberRow: React.FC<MemberRowProps> = ({
  memberId,
  username,
  displayName,
  fullNameFromHR,
  avatar,
  role,
  currentUserId,
  currentUserRole,
  capabilities,
  onMakeAdmin,
  onRemoveAdmin,
  onTransferOwnership,
  onBanMember,
  onRemoveMember,
  isLoading = false,
  className,
}) => {
  const { t } = useTranslation("profile");

  const { displayName: resolvedName, usedFallback } = resolveDisplayName({
    displayName,
    fullNameFromHR,
    username,
  });

  const isCurrentUser = memberId === currentUserId;

  return (
    <div
      className={clsx(
        "group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-hover",
        className,
      )}
    >
      {/* Avatar — 32px */}
      <div className="shrink-0">
        <Avatar src={avatar} alt={resolvedName} size="sm" />
      </div>

      {/* Name + secondary info — takes remaining space, truncates */}
      <div className="min-w-0 flex-1">
        <p
          className={clsx(
            "truncate text-sm font-medium leading-snug text-text-primary",
            usedFallback && "italic",
          )}
          title={resolvedName}
        >
          {resolvedName}
        </p>
        <p className="truncate text-xs leading-snug text-text-muted">
          @{username}
          {isCurrentUser && (
            <span className="ml-1 font-medium text-text-secondary">
              · {t("profile:groupInfo.youSuffix")}
            </span>
          )}
        </p>
      </div>

      {/* Right column: role badge + actions kebab */}
      <div className="flex shrink-0 items-center gap-1">
        <MemberRoleBadge role={role} />
        <MemberActionsMenu
          memberId={memberId}
          memberName={resolvedName}
          memberRole={role}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          capabilities={capabilities}
          onMakeAdmin={onMakeAdmin}
          onRemoveAdmin={onRemoveAdmin}
          onTransferOwnership={onTransferOwnership}
          onBanMember={onBanMember}
          onRemoveMember={onRemoveMember}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
};
