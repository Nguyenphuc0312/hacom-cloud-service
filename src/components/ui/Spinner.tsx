/**
 * @fileoverview Spinner component
 * Loading spinner with semantic token variants.
 */

import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Skeleton } from "./Skeleton";

interface SpinnerProps {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  variant?: "primary" | "inverse" | "neutral";
  className?: string;
}

const sizeClasses = {
  xs: "h-3 w-3 border",
  sm: "h-4 w-4 border-2",
  md: "h-6 w-6 border-2",
  lg: "h-8 w-8 border-2",
  xl: "h-12 w-12 border-2",
};

const variantClasses = {
  primary: "border-primary/25 border-t-primary",
  inverse: "border-text-inverse/35 border-t-text-inverse",
  neutral: "border-border border-t-text-secondary",
};

export const Spinner: React.FC<SpinnerProps> = ({
  size = "md",
  variant = "primary",
  className,
}) => {
  const { t } = useTranslation();

  return (
    <div
      className={clsx(
        "animate-spin rounded-full",
        sizeClasses[size],
        variantClasses[variant],
        className,
      )}
      role="status"
      aria-label={t("common:loading.default")}
    />
  );
};

export const PageSpinner: React.FC<{ message?: string }> = ({ message }) => {
  const { t } = useTranslation();
  const label = message ?? t("common:loading.page");

  return (
    <div className="app-loading-screen" role="status" aria-live="polite">
      <div className="app-loading-mark">
        <img
          src="/logo.png"
          width="56"
          height="56"
          alt=""
          className="h-14 w-14 rounded-2xl shadow-sm"
        />
        <div className="app-loading-progress" aria-hidden="true">
          <span className="app-loading-progress__bar" />
        </div>
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
};

export const LoadingText: React.FC<{ text?: string; className?: string }> = ({
  text,
  className,
}) => {
  const { t } = useTranslation();
  const displayText = text ?? t("common:loading.default");

  return (
    <div
      className={clsx("flex items-center gap-2", className)}
      aria-busy="true"
      aria-label={displayText}
      role="status"
    >
      <Skeleton className="h-3 w-28" rounded="full" />
    </div>
  );
};

export default Spinner;
