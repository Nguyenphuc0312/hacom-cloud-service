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
import { useEnrichedProfileStore } from "../../../../stores/enrichedProfileStore";

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
  onMemberClick?: (memberId: string) => void;
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
  onMemberClick,
  isLoading = false,
  className,
}) => {
  const { t } = useTranslation("profile");

  const alias = useEnrichedProfileStore((s) => s.nameByUserId[memberId]);
  const { displayName: resolvedName, usedFallback } = resolveDisplayName({
    displayName: alias || displayName,
    fullNameFromHR: alias ? undefined : fullNameFromHR,
    username,
  });

  const isCurrentUser = memberId === currentUserId;

  return (
    <div
      role="button"
      tabIndex={0}
      className={clsx(
        "group flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40",
        className,
      )}
      onClick={() => onMemberClick?.(memberId)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onMemberClick?.(memberId); }}
      aria-label={`Xem hồ sơ ${resolvedName}`}
    >
      {/* Avatar */}
      <div className="shrink-0">
        <Avatar src={avatar} alt={resolvedName} size="sm" />
      </div>

      {/* Name + secondary info */}
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
      <div
        className="flex shrink-0 items-center gap-1"
        onClick={(e) => e.stopPropagation()}
      >
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
