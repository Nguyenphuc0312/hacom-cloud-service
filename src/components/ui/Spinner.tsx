/**
 * @fileoverview Spinner component
 * Loading spinner with semantic token variants.
 */

import React from "react";
import clsx from "clsx";

interface SpinnerProps {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  variant?: "primary" | "white" | "gray";
  className?: string;
}

const sizeClasses = {
  xs: "h-3 w-3 border",
  sm: "h-4 w-4 border-2",
  md: "h-6 w-6 border-2",
  lg: "h-8 w-8 border-2",
  xl: "h-12 w-12 border-[3px]",
};

const variantClasses = {
  primary: "border-primary/25 border-t-primary",
  white: "border-text-inverse/35 border-t-text-inverse",
  gray: "border-border border-t-text-secondary",
};

export const Spinner: React.FC<SpinnerProps> = ({
  size = "md",
  variant = "primary",
  className,
}) => {
  return (
    <div
      className={clsx(
        "animate-spin rounded-full",
        sizeClasses[size],
        variantClasses[variant],
        className,
      )}
      role="status"
      aria-label="Loading"
    />
  );
};

export const PageSpinner: React.FC<{ message?: string }> = ({
  message = "Loading...",
}) => {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-surface/80 backdrop-blur-sm">
      <Spinner size="xl" />
      {message && <p className="mt-4 animate-pulse text-sm text-text-secondary">{message}</p>}
    </div>
  );
};

export const LoadingText: React.FC<{ text?: string; className?: string }> = ({
  text = "Loading...",
  className,
}) => {
  return (
    <div className={clsx("flex items-center gap-2 text-text-muted", className)}>
      <Spinner size="sm" variant="gray" />
      <span className="text-sm">{text}</span>
    </div>
  );
};

export default Spinner;
