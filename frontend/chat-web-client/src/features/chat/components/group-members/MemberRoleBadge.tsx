import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { RoomMemberRole } from "../../../../types";

interface MemberRoleBadgeProps {
  role: RoomMemberRole;
  className?: string;
}

// Only elevated roles get a visual badge. MEMBER and RESTRICTED are implicit.
const BADGE_CONFIG: Partial<Record<RoomMemberRole, { label: (t: (k: string) => string) => string; style: string }>> = {
  [RoomMemberRole.OWNER]: {
    label: (t) => t("profile:groupInfo.roles.owner"),
    style: "bg-amber-50 text-amber-700",
  },
  [RoomMemberRole.ADMIN]: {
    label: (t) => t("profile:groupInfo.roles.admin"),
    style: "bg-[#1976D2]/8 text-[#1565C0]",
  },
  [RoomMemberRole.MODERATOR]: {
    label: () => "Mod",
    style: "bg-purple-50 text-purple-600",
  },
  [RoomMemberRole.BANNED]: {
    label: () => "Banned",
    style: "bg-danger/8 text-danger",
  },
};

export const MemberRoleBadge: React.FC<MemberRoleBadgeProps> = ({ role, className }) => {
  const { t } = useTranslation("profile");

  const config = BADGE_CONFIG[role];
  if (!config) return null;

  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-none",
        config.style,
        className,
      )}
    >
      {config.label(t)}
    </span>
  );
};
