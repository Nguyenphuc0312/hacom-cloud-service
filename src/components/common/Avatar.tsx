import React from "react";
import clsx from "clsx";
import { UserStatus } from "../../types";

interface AvatarProps {
  src?: string;
  alt: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  status?: UserStatus;
  showStatus?: boolean;
  className?: string;
  onClick?: () => void;
}

const sizeClasses = {
  xs: "w-6 h-6",
  sm: "w-8 h-8",
  md: "w-10 h-10",
  lg: "w-12 h-12",
  xl: "w-16 h-16",
};

const statusSizeClasses = {
  xs: "w-2 h-2",
  sm: "w-2.5 h-2.5",
  md: "w-3 h-3",
  lg: "w-3.5 h-3.5",
  xl: "w-4 h-4",
};

const statusColors: Record<UserStatus, string> = {
  [UserStatus.ONLINE]: "bg-chat-online",
  [UserStatus.OFFLINE]: "bg-chat-offline",
  [UserStatus.AWAY]: "bg-chat-away",
  [UserStatus.DND]: "bg-red-500",
  [UserStatus.INVISIBLE]: "bg-gray-400",
  [UserStatus.BUSY]: "bg-orange-500",
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
  const initials = alt
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      className={clsx("relative inline-block flex-shrink-0", className)}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          className={clsx(
            sizeClasses[size],
            "rounded-full object-cover ring-2 ring-white",
            onClick && "cursor-pointer hover:opacity-90 transition-opacity",
          )}
          loading="lazy"
        />
      ) : (
        <div
          className={clsx(
            sizeClasses[size],
            "rounded-full bg-telegram-primary flex items-center justify-center text-white font-medium",
            onClick && "cursor-pointer hover:opacity-90 transition-opacity",
            size === "xs" && "text-[10px]",
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
            "absolute bottom-0 right-0 rounded-full ring-2 ring-white",
            statusSizeClasses[size],
            statusColors[status],
            status === UserStatus.ONLINE && "animate-pulse-online",
          )}
          aria-label={`Status: ${status}`}
        />
      )}
    </div>
  );
};

export default Avatar;
