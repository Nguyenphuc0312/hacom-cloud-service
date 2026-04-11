import React from "react";
import clsx from "clsx";

interface SurfaceProps {
  className?: string;
  children: React.ReactNode;
}

interface TabTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export const SurfaceCard: React.FC<SurfaceProps> = ({
  className,
  children,
}) => <section className={clsx("surface-card", className)}>{children}</section>;

export const PanelSection: React.FC<SurfaceProps> = ({
  className,
  children,
}) => (
  <section className={clsx("panel-section", className)}>{children}</section>
);

export const TabTrigger: React.FC<TabTriggerProps> = ({
  active = false,
  className,
  children,
  ...props
}) => (
  <button
    type="button"
    className={clsx(
      "inline-flex min-h-9 items-center justify-center rounded-md px-3 py-2 text-body-sm font-medium transition-micro",
      active
        ? "bg-surface text-text-primary shadow-xs"
        : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
      className,
    )}
    {...props}
  >
    {children}
  </button>
);

export const IconButtonSurface: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement>
> = ({ className, children, type = "button", ...props }) => (
  <button
    type={type}
    className={clsx(
      "icon-button-surface h-10 w-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
      className,
    )}
    {...props}
  >
    {children}
  </button>
);

export default SurfaceCard;
