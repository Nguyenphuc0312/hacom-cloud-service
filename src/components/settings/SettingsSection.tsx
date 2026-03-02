/**
 * @fileoverview SettingsSection layout component
 * Renders a titled section card with icon — Zalo-like appearance.
 */

import React from "react";
import clsx from "clsx";

interface SettingsSectionProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export const SettingsSection: React.FC<SettingsSectionProps> = ({
  icon,
  title,
  description,
  children,
  className,
}) => {
  return (
    <section
      className={clsx(
        "rounded-2xl border border-border bg-surface p-4 sm:p-5",
        className,
      )}
    >
      {/* Header */}
      <div className="mb-3 flex items-center gap-3">
        {icon && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {icon}
          </div>
        )}
        <div>
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          {description && (
            <p className="mt-0.5 text-xs text-text-muted">{description}</p>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="mb-2 border-t border-border" />

      {/* Body */}
      <div className="space-y-1">{children}</div>
    </section>
  );
};

export default SettingsSection;
