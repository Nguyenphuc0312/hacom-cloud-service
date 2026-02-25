import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { UserStatus } from "../../types";

interface AvatarProps {
  src?: string | null;
  alt?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
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
};

const statusSizeClasses = {
  xs: "h-2 w-2",
  sm: "h-3 w-3",
  md: "h-3 w-3",
  lg: "h-4 w-4",
  xl: "h-4 w-4",
};

const statusColors: Record<UserStatus, string> = {
  [UserStatus.ONLINE]: "bg-state-online",
  [UserStatus.OFFLINE]: "bg-state-offline",
  [UserStatus.AWAY]: "bg-state-away",
  [UserStatus.DND]: "bg-danger",
  [UserStatus.INVISIBLE]: "bg-border-strong",
  [UserStatus.BUSY]: "bg-warning",
};

const statusLabelKeys: Record<UserStatus, string> = {
  [UserStatus.ONLINE]: "common:status.online",
  [UserStatus.OFFLINE]: "common:status.offline",
  [UserStatus.AWAY]: "common:status.away",
  [UserStatus.DND]: "common:status.dnd",
  [UserStatus.INVISIBLE]: "common:status.invisible",
  [UserStatus.BUSY]: "common:status.busy",
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

  const initials =
    safeAlt
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "?";

  return (
    <div
      className={clsx("relative inline-block shrink-0", className)}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {safeSrc ? (
        <img
          src={safeSrc}
          alt={safeAlt}
          className={clsx(
            sizeClasses[size],
            "rounded-full object-cover ring-2 ring-surface",
            onClick && "cursor-pointer transition-opacity hover:opacity-90",
          )}
          loading="lazy"
        />
      ) : (
        <div
          className={clsx(
            sizeClasses[size],
            "flex items-center justify-center rounded-full bg-primary font-medium text-text-inverse",
            onClick && "cursor-pointer transition-opacity hover:opacity-90",
            size === "xs" && "text-xs",
            size === "sm" && "text-xs",
            size === "md" && "text-sm",
            size === "lg" && "text-base",
            size === "xl" && "text-lg",
          )}
        >
          {initials}
        </div>
      )}

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

