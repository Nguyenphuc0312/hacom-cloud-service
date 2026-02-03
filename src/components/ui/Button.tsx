/**
 * @fileoverview Button component
 * Reusable button với nhiều variants, sizes và states
 */

import React from "react";
import clsx from "clsx";
import { Spinner } from "./Spinner";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "link";
  size?: "xs" | "sm" | "md" | "lg";
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

const variantClasses = {
  primary:
    "bg-telegram-primary text-white hover:bg-telegram-primary/90 focus:ring-telegram-primary/50 shadow-sm",
  secondary: "bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-200",
  outline:
    "border-2 border-telegram-primary text-telegram-primary hover:bg-telegram-primary/5 focus:ring-telegram-primary/50",
  ghost:
    "text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:ring-gray-200",
  danger:
    "bg-red-500 text-white hover:bg-red-600 focus:ring-red-500/50 shadow-sm",
  link: "text-telegram-primary hover:text-telegram-primary/80 hover:underline p-0 h-auto",
};

const sizeClasses = {
  xs: "px-2.5 py-1 text-xs rounded",
  sm: "px-3 py-1.5 text-sm rounded-lg",
  md: "px-4 py-2 text-sm rounded-lg",
  lg: "px-6 py-3 text-base rounded-xl",
};

const iconSizeClasses = {
  xs: "w-3 h-3",
  sm: "w-4 h-4",
  md: "w-4 h-4",
  lg: "w-5 h-5",
};

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = "primary",
  size = "md",
  isLoading = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  disabled,
  className,
  ...props
}) => {
  const isDisabled = disabled || isLoading;

  return (
    <button
      disabled={isDisabled}
      className={clsx(
        // Base styles
        "inline-flex items-center justify-center gap-2 font-medium",
        "transition-all duration-200",
        "focus:outline-none focus:ring-2 focus:ring-offset-2",
        "disabled:opacity-60 disabled:cursor-not-allowed disabled:pointer-events-none",
        // Variant & size
        variant !== "link" && variantClasses[variant],
        variant !== "link" && sizeClasses[size],
        variant === "link" && variantClasses.link,
        // Full width
        fullWidth && "w-full",
        // Hover scale (except when disabled)
        !isDisabled && variant !== "link" && "active:scale-[0.98]",
        className,
      )}
      {...props}
    >
      {isLoading ? (
        <>
          <Spinner
            size={size === "lg" ? "sm" : "xs"}
            variant={
              variant === "primary" || variant === "danger" ? "white" : "gray"
            }
          />
          <span>Đang xử lý...</span>
        </>
      ) : (
        <>
          {leftIcon && (
            <span className={clsx("flex-shrink-0", iconSizeClasses[size])}>
              {leftIcon}
            </span>
          )}
          {children}
          {rightIcon && (
            <span className={clsx("flex-shrink-0", iconSizeClasses[size])}>
              {rightIcon}
            </span>
          )}
        </>
      )}
    </button>
  );
};

/**
 * Icon-only button
 */
interface IconButtonProps extends Omit<ButtonProps, "leftIcon" | "rightIcon"> {
  icon: React.ReactNode;
  "aria-label": string;
}

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  size = "md",
  variant = "ghost",
  className,
  ...props
}) => {
  const iconButtonSizes = {
    xs: "w-6 h-6",
    sm: "w-8 h-8",
    md: "w-10 h-10",
    lg: "w-12 h-12",
  };

  return (
    <Button
      variant={variant}
      size={size}
      className={clsx("!p-0", iconButtonSizes[size], className)}
      {...props}
    >
      <span className={iconSizeClasses[size]}>{icon}</span>
    </Button>
  );
};

export default Button;
