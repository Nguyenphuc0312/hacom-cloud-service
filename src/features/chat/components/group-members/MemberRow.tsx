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
  departmentName?: string;
  companyName?: string;
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
  departmentName,
  companyName,
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

  // enrichedProfileStore holds the alias when set, otherwise the enriched real
  // name. It always wins — same rule as ChatHeader/RoomItem/MessageCluster — so
  // the memorable name stays consistent with every other place it's shown.
  const enrichedName = useEnrichedProfileStore((s) => s.nameByUserId[memberId]);
  const resolved = resolveDisplayName({ displayName, fullNameFromHR, username });
  const resolvedName = enrichedName || resolved.displayName;
  const usedFallback = enrichedName ? false : resolved.usedFallback;

  const isCurrentUser = memberId === currentUserId;
  const orgLine = [departmentName, companyName].filter(Boolean).join(" · ");

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
          {isCurrentUser && (
            <span className="ml-1 text-xs font-medium text-text-secondary">
              · {t("profile:groupInfo.youSuffix")}
            </span>
          )}
        </p>
        {orgLine && (
          <p className="truncate text-xs leading-snug text-text-muted" title={orgLine}>
            {orgLine}
          </p>
        )}
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
