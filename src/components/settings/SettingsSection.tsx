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
        "app-page-panel p-5 sm:p-6",
        className,
      )}
    >
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        {icon && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[1rem] bg-primary/10 text-primary">
            {icon}
          </div>
        )}
        <div>
          <h3 className="text-title-sm text-text-primary">{title}</h3>
          {description && (
            <p className="mt-1 text-body-sm text-text-secondary">{description}</p>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="mt-4 space-y-2">{children}</div>
    </section>
  );
};

export default SettingsSection;
