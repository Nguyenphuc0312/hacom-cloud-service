import React from "react";
import clsx from "clsx";

interface BadgeProps {
  count?: number;
  text?: string;
  variant?: "primary" | "secondary" | "muted" | "danger" | "success";
  size?: "sm" | "md" | "lg";
  dot?: boolean;
  className?: string;
}

const variantClasses = {
  primary: "bg-telegram-primary text-white",
  secondary: "bg-zalo-primary text-white",
  muted: "bg-gray-400 text-white",
  danger: "bg-red-500 text-white",
  success: "bg-chat-online text-white",
};

const sizeClasses = {
  sm: "text-[10px] min-w-[16px] h-4 px-1",
  md: "text-xs min-w-[20px] h-5 px-1.5",
  lg: "text-sm min-w-[24px] h-6 px-2",
};

export const Badge: React.FC<BadgeProps> = ({
  count,
  text,
  variant = "primary",
  size = "sm",
  dot = false,
  className,
}) => {
  if (dot) {
    return (
      <span
        className={clsx(
          "inline-block rounded-full",
          variant === "primary" && "bg-telegram-primary",
          variant === "secondary" && "bg-zalo-primary",
          variant === "muted" && "bg-gray-400",
          variant === "danger" && "bg-red-500",
          variant === "success" && "bg-chat-online",
          size === "sm" && "w-2 h-2",
          size === "md" && "w-2.5 h-2.5",
          size === "lg" && "w-3 h-3",
          className,
        )}
        aria-hidden="true"
      />
    );
  }

  const displayValue =
    text ||
    (count !== undefined ? (count > 99 ? "99+" : count.toString()) : "");

  if (!displayValue) return null;

  return (
    <span
      className={clsx(
        "inline-flex items-center justify-center rounded-full font-medium",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
    >
      {displayValue}
    </span>
  );
};

export default Badge;
