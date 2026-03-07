import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { UserStatus } from "../../types";

interface OnlineIndicatorProps {
  status: UserStatus;
  size?: "sm" | "md" | "lg";
  pulse?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: "w-2 h-2",
  md: "w-3 h-3",
  lg: "w-4 h-4",
};

const statusColors: Record<UserStatus, string> = {
  [UserStatus.ONLINE]: "bg-chat-online",
  [UserStatus.OFFLINE]: "bg-chat-offline",
  [UserStatus.AWAY]: "bg-chat-away",
  [UserStatus.IDLE]: "bg-chat-away",
  [UserStatus.DND]: "bg-state-dnd",
  [UserStatus.INVISIBLE]: "bg-border-strong",
  [UserStatus.BUSY]: "bg-state-busy",
};

const statusLabelKeys: Record<UserStatus, string> = {
  [UserStatus.ONLINE]: "common:status.online",
  [UserStatus.OFFLINE]: "common:status.offline",
  [UserStatus.AWAY]: "common:status.away",
  [UserStatus.IDLE]: "common:status.away",
  [UserStatus.DND]: "common:status.dnd",
  [UserStatus.INVISIBLE]: "common:status.invisible",
  [UserStatus.BUSY]: "common:status.busy",
};

export const OnlineIndicator: React.FC<OnlineIndicatorProps> = ({
  status,
  size = "md",
  pulse = true,
  className,
}) => {
  const { t } = useTranslation();
  return (
    <span
      className={clsx(
        "inline-block rounded-full ring-2 ring-surface",
        sizeClasses[size],
        statusColors[status],
        status === UserStatus.ONLINE && pulse && "animate-pulse-online",
        className,
      )}
      aria-label={`${t("common:statusLabel")}: ${t(statusLabelKeys[status])}`}
    />
  );
};

export default OnlineIndicator;
