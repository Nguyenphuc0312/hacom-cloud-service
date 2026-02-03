import React from "react";
import clsx from "clsx";
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
  [UserStatus.DND]: "bg-red-500",
  [UserStatus.INVISIBLE]: "bg-gray-400",
  [UserStatus.BUSY]: "bg-orange-500",
};

export const OnlineIndicator: React.FC<OnlineIndicatorProps> = ({
  status,
  size = "md",
  pulse = true,
  className,
}) => {
  return (
    <span
      className={clsx(
        "inline-block rounded-full ring-2 ring-white",
        sizeClasses[size],
        statusColors[status],
        status === UserStatus.ONLINE && pulse && "animate-pulse-online",
        className,
      )}
      aria-label={`Status: ${status}`}
    />
  );
};

export default OnlineIndicator;
