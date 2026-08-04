import React from "react";
import clsx from "clsx";

interface AuthShellProps {
  children: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

interface AuthCardProps {
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
}

const maxWidthClass: Record<NonNullable<AuthShellProps["maxWidth"]>, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
};

export const AuthShell: React.FC<AuthShellProps> = ({
  children,
  maxWidth = "md",
  className,
}) => {
  return (
    <div className="auth-shell">
      <div
        className={clsx("auth-shell-inner", maxWidthClass[maxWidth], className)}
      >
        {children}
      </div>
    </div>
  );
};

export const AuthCard: React.FC<AuthCardProps> = ({
  children,
  className,
  ariaLabel,
}) => {
  return (
    <section
      aria-label={ariaLabel}
      className={clsx("auth-card animate-fade-in p-6 sm:p-7", className)}
    >
      {children}
    </section>
  );
};

export default AuthShell;
