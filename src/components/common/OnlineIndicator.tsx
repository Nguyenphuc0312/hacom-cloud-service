import React from "react";
import clsx from "clsx";
import type { User } from "../../types";

interface OnlineIndicatorProps {
  status: User["status"];
  size?: "sm" | "md" | "lg";
  pulse?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: "w-2 h-2",
  md: "w-3 h-3",
  lg: "w-4 h-4",
};

const statusColors = {
  online: "bg-chat-online",
  offline: "bg-chat-offline",
  away: "bg-chat-away",
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
        status === "online" && pulse && "animate-pulse-online",
        className,
      )}
      aria-label={`Status: ${status}`}
    />
  );
};

export default OnlineIndicator;
