import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { UserIcon } from "@heroicons/react/24/outline";
import { UserStatus } from "../../types";
import { getInitials } from "../../utils/mediaFallback";
import { SafeImage } from "./SafeImage";

interface AvatarProps {
  src?: string | null;
  alt?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  status?: UserStatus;
  showStatus?: boolean;
  className?: string;
  onClick?: () => void;
}

const sizeClasses = {
  xs: "h-6 w-6",
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-12 w-12",
  xl: "h-16 w-16",
  "2xl": "h-32 w-32",
};

const statusSizeClasses = {
  xs: "h-2 w-2",
  sm: "h-3 w-3",
  md: "h-3 w-3",
  lg: "h-4 w-4",
  xl: "h-4 w-4",
  "2xl": "h-6 w-6",
};

const statusColors: Record<UserStatus, string> = {
  [UserStatus.ONLINE]: "bg-state-online",
  [UserStatus.OFFLINE]: "bg-state-offline",
  [UserStatus.AWAY]: "bg-state-away",
  [UserStatus.IDLE]: "bg-state-away",
  [UserStatus.DND]: "bg-danger",
  [UserStatus.INVISIBLE]: "bg-border-strong",
  [UserStatus.BUSY]: "bg-warning",
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

const iconClasses = {
  xs: "h-3 w-3",
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-6 w-6",
  xl: "h-8 w-8",
};

export const Avatar: React.FC<AvatarProps> = ({
  src,
  alt,
  size = "md",
  status,
  showStatus = false,
  className,
  onClick,
}) => {
  const { t } = useTranslation();
  const normalizedAlt = typeof alt === "string" ? alt.trim() : "";
  const safeAlt = normalizedAlt || t("common:labels.user");
  const safeSrc =
    typeof src === "string" && src.trim().length > 0 ? src.trim() : undefined;
  const initials = getInitials(normalizedAlt);
  const fallback = (
    <div
      className={clsx(
        sizeClasses[size],
        "flex items-center justify-center rounded-full bg-primary font-medium text-text-inverse ring-2 ring-surface",
        onClick && "cursor-pointer transition-opacity hover:opacity-90",
        size === "xs" && "text-xs",
        size === "sm" && "text-xs",
        size === "md" && "text-sm",
        size === "lg" && "text-base",
        size === "xl" && "text-lg",
      )}
      aria-hidden="true"
    >
      {initials || (
        <UserIcon className={iconClasses[size]} aria-hidden="true" />
      )}
    </div>
  );

  return (
    <div
      className={clsx("relative inline-block shrink-0", className)}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <SafeImage
        src={safeSrc}
        alt={safeAlt}
        className={clsx(
          sizeClasses[size],
          "rounded-full object-cover ring-2 ring-surface",
          onClick && "cursor-pointer transition-opacity hover:opacity-90",
        )}
        fallback={fallback}
      />

      {showStatus && status && (
        <span
          className={clsx(
            "absolute bottom-0 right-0 rounded-full ring-2 ring-surface",
            statusSizeClasses[size],
            statusColors[status],
            status === UserStatus.ONLINE && "animate-pulse-online",
          )}
          aria-label={`${t("common:statusLabel")}: ${t(statusLabelKeys[status])}`}
        />
      )}
    </div>
  );
};

export default Avatar;
