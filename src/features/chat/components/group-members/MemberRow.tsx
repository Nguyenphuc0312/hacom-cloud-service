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
  status,
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
  isMobile = false,
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
        "group flex items-center gap-3 px-4 py-2 transition-colors",
        "hover:bg-gray-50 dark:hover:bg-gray-800",
        !isMobile && "cursor-default",
        isMobile && "cursor-pointer",
        className,
      )}
    >
      {/* Avatar */}
      <div className="shrink-0">
        <Avatar
          src={avatar}
          alt={resolvedName}
          size="sm"
        />
      </div>

      {/* Name and username */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={clsx(
              "truncate text-sm font-medium text-text-primary",
              usedFallback && "italic",
            )}
            title={usedFallback ? t("profile:groupInfo.noRealName") : undefined}
          >
            {resolvedName}
          </span>

          {isCurrentUser && (
            <span className="shrink-0 text-xs text-text-muted">
              ({t("profile:groupInfo.youSuffix")})
            </span>
          )}

          <MemberRoleBadge role={role} />
        </div>

        <p className="truncate text-xs text-text-muted">@{username}</p>
      </div>

      {/* Actions menu */}
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
  );
};
