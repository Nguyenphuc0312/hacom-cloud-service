import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { RoomMemberRole } from "../../../../types";

interface MemberRoleBadgeProps {
  role: RoomMemberRole;
  className?: string;
}

export const MemberRoleBadge: React.FC<MemberRoleBadgeProps> = ({ role, className }) => {
  const { t } = useTranslation("profile");

  const roleLabels: Record<RoomMemberRole, string> = {
    [RoomMemberRole.OWNER]: t("profile:groupInfo.roles.owner"),
    [RoomMemberRole.ADMIN]: t("profile:groupInfo.roles.admin"),
    [RoomMemberRole.MODERATOR]: "Mod",
    [RoomMemberRole.MEMBER]: t("profile:groupInfo.roles.member"),
    [RoomMemberRole.RESTRICTED]: "Hạn chế",
    [RoomMemberRole.BANNED]: "Banned",
  };

  const roleClasses: Record<RoomMemberRole, string> = {
    [RoomMemberRole.OWNER]: "bg-warning/15 text-warning",
    [RoomMemberRole.ADMIN]: "bg-[#C41E3A]/10 text-[#C41E3A]",
    [RoomMemberRole.MODERATOR]: "bg-purple-500/15 text-purple-600",
    [RoomMemberRole.MEMBER]: "bg-surface-overlay text-text-muted",
    [RoomMemberRole.RESTRICTED]: "bg-orange-500/15 text-orange-600",
    [RoomMemberRole.BANNED]: "bg-danger/15 text-danger",
  };

  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-caption",
        roleClasses[role] || roleClasses[RoomMemberRole.MEMBER],
        className,
      )}
    >
      {roleLabels[role] || roleLabels[RoomMemberRole.MEMBER]}
    </span>
  );
};
