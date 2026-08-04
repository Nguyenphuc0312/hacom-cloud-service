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
  primary: "bg-primary text-text-inverse",
  secondary: "bg-secondary text-text-inverse",
  muted: "bg-border-strong text-text-inverse",
  danger: "bg-danger text-text-inverse",
  success: "bg-success text-text-inverse",
};

const sizeClasses = {
  sm: "h-4 min-w-4 px-1 text-xs",
  md: "h-5 min-w-5 px-2 text-xs",
  lg: "h-6 min-w-6 px-2 text-sm",
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
          variant === "primary" && "bg-primary",
          variant === "secondary" && "bg-secondary",
          variant === "muted" && "bg-border-strong",
          variant === "danger" && "bg-danger",
          variant === "success" && "bg-success",
          size === "sm" && "h-2 w-2",
          size === "md" && "h-3 w-3",
          size === "lg" && "h-3 w-3",
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
        "transition-badge inline-flex items-center justify-center rounded-full font-medium shadow-xs",
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

