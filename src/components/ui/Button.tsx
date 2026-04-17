/**
 * @fileoverview Button component
 * Reusable button with semantic design tokens.
 */

import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Spinner } from "./Spinner";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "primary"
    | "secondary"
    | "outline"
    | "ghost"
    | "danger"
    | "destructive"
    | "link";
  size?: "xs" | "sm" | "md" | "lg";
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

const variantClasses = {
  primary:
    "border border-primary bg-primary text-text-inverse hover:bg-primary-hover active:bg-primary-active focus:ring-focus/25",
  secondary:
    "border border-border bg-surface-overlay text-text-primary hover:bg-surface-hover active:bg-surface-active focus:ring-focus/20",
  outline:
    "border border-primary/40 bg-transparent text-primary hover:bg-primary/10 active:bg-primary/15 focus:ring-focus/25",
  ghost:
    "border border-transparent bg-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary active:bg-surface-active focus:ring-focus/20",
  danger:
    "border border-danger bg-danger text-text-inverse hover:bg-danger-hover active:bg-danger-hover focus:ring-danger/30",
  destructive:
    "border border-danger bg-danger text-text-inverse hover:bg-danger-hover active:bg-danger-hover focus:ring-danger/30",
  link: "h-auto p-0 text-primary hover:text-primary/80 hover:underline",
};

const sizeClasses = {
  xs: "rounded-sm px-2 py-1 text-caption",
  sm: "rounded-md px-3 py-2 text-body-sm",
  md: "rounded-md px-4 py-2 text-body-sm",
  lg: "rounded-lg px-5 py-3 text-body",
};

const iconSizeClasses = {
  xs: "h-3 w-3",
  sm: "h-4 w-4",
  md: "h-4 w-4",
  lg: "h-5 w-5",
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
  const { t } = useTranslation();
  const isDisabled = disabled || isLoading;
  const resolvedVariant = variant === "danger" ? "destructive" : variant;

  return (
    <button
      disabled={isDisabled}
      className={clsx(
        "inline-flex min-h-10 items-center justify-center gap-2 font-medium",
        "transition-micro",
        "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-surface",
        "disabled:cursor-not-allowed disabled:border-disabled-border disabled:bg-disabled-bg disabled:text-text-disabled disabled:opacity-65",
        resolvedVariant !== "link" && variantClasses[resolvedVariant],
        resolvedVariant !== "link" && sizeClasses[size],
        variant === "link" && variantClasses.link,
        fullWidth && "w-full",
        !isDisabled && resolvedVariant !== "link" && "active:scale-[0.98]",
        className,
      )}
      {...props}
    >
      {isLoading ? (
        <>
          <Spinner
            size={size === "lg" ? "sm" : "xs"}
            variant={
              resolvedVariant === "primary" || resolvedVariant === "destructive"
                ? "inverse"
                : "neutral"
            }
          />
          <span>{t("common:loading.processing")}</span>
        </>
      ) : (
        <>
          {leftIcon && (
            <span className={clsx("shrink-0", iconSizeClasses[size])}>
              {leftIcon}
            </span>
          )}
          {children}
          {rightIcon && (
            <span className={clsx("shrink-0", iconSizeClasses[size])}>
              {rightIcon}
            </span>
          )}
        </>
      )}
    </button>
  );
};

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
    xs: "h-6 w-6",
    sm: "h-8 w-8",
    md: "h-10 w-10 rounded-md",
    lg: "h-12 w-12",
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
