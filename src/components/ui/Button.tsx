/**
 * @fileoverview Button component
 * Reusable button with semantic design tokens.
 */

import React, { forwardRef } from "react";
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
    | "link"
    | "brand"
    | "brand-yellow"
    | "brand-outline";
  size?: "xs" | "sm" | "md" | "lg";
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

const variantClasses = {
  brand:
    "border border-[#1565C0] bg-[#1565C0] text-white shadow-md shadow-[#1565C0]/20 hover:bg-[#1976D2] focus:ring-[#1565C0]/25",
  "brand-yellow":
    "border border-[#1565C0]/70 bg-[#1565C0] text-white shadow-md shadow-[#1565C0]/25 hover:bg-[#1976D2] focus:ring-[#1565C0]/25",
  "brand-outline":
    "border border-[#1976D2]/60 bg-transparent text-[#1565C0] hover:bg-[#1976D2]/8 active:bg-[#1976D2]/12 focus:ring-[#1565C0]/25",
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
  xs: "min-h-8 rounded-sm px-2.5 text-caption",
  sm: "min-h-[var(--control-height-sm)] rounded-md px-3 text-body-sm",
  md: "min-h-[var(--control-height-md)] rounded-md px-4 text-body-sm",
  lg: "min-h-[var(--control-height-lg)] rounded-lg px-5 text-body",
};

const iconSizeClasses = {
  xs: "h-3 w-3",
  sm: "h-4 w-4",
  md: "h-4 w-4",
  lg: "h-5 w-5",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
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
    },
    ref,
  ) => {
    const { t } = useTranslation();
    const isDisabled = disabled || isLoading;
    const resolvedVariant = variant === "danger" ? "destructive" : (variant ?? "primary");

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={clsx(
          "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium",
          "transition-micro",
          "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-surface",
          resolvedVariant === "brand" || resolvedVariant === "brand-yellow" || resolvedVariant === "brand-outline"
            ? "disabled:cursor-not-allowed disabled:opacity-40"
            : "disabled:cursor-not-allowed disabled:border-disabled-border disabled:bg-disabled-bg disabled:text-text-disabled disabled:opacity-65",
          resolvedVariant !== "link" && variantClasses[resolvedVariant as keyof typeof variantClasses],
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
                resolvedVariant === "primary" || resolvedVariant === "destructive" || resolvedVariant === "brand" || resolvedVariant === "brand-yellow"
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
  },
);

Button.displayName = "Button";

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
    xs: "h-8 w-8 rounded-sm",
    sm: "h-[var(--control-height-sm)] w-[var(--control-height-sm)] rounded-md",
    md: "h-[var(--control-height-md)] w-[var(--control-height-md)] rounded-md",
    lg: "h-[var(--control-height-lg)] w-[var(--control-height-lg)] rounded-lg",
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
