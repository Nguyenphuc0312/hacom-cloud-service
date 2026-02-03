/**
 * @fileoverview Spinner component
 * Loading spinner với nhiều size và variants
 */

import React from "react";
import clsx from "clsx";

interface SpinnerProps {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  variant?: "primary" | "white" | "gray";
  className?: string;
}

const sizeClasses = {
  xs: "w-3 h-3 border",
  sm: "w-4 h-4 border-2",
  md: "w-6 h-6 border-2",
  lg: "w-8 h-8 border-2",
  xl: "w-12 h-12 border-3",
};

const variantClasses = {
  primary: "border-telegram-primary/30 border-t-telegram-primary",
  white: "border-white/30 border-t-white",
  gray: "border-gray-300 border-t-gray-600",
};

export const Spinner: React.FC<SpinnerProps> = ({
  size = "md",
  variant = "primary",
  className,
}) => {
  return (
    <div
      className={clsx(
        "rounded-full animate-spin",
        sizeClasses[size],
        variantClasses[variant],
        className,
      )}
      role="status"
      aria-label="Loading"
    />
  );
};

/**
 * Full page loading spinner
 */
export const PageSpinner: React.FC<{ message?: string }> = ({
  message = "Đang tải...",
}) => {
  return (
    <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center z-50">
      <Spinner size="xl" />
      {message && (
        <p className="mt-4 text-gray-600 text-sm animate-pulse">{message}</p>
      )}
    </div>
  );
};

/**
 * Inline loading spinner với text
 */
export const LoadingText: React.FC<{ text?: string; className?: string }> = ({
  text = "Đang tải...",
  className,
}) => {
  return (
    <div className={clsx("flex items-center gap-2 text-gray-500", className)}>
      <Spinner size="sm" variant="gray" />
      <span className="text-sm">{text}</span>
    </div>
  );
};

export default Spinner;
