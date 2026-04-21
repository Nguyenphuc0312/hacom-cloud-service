/**
 * @fileoverview Thin settings section shell.
 */

import React from "react";
import clsx from "clsx";

interface SettingsSectionProps {
  id?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  headerActions?: React.ReactNode;
}

export const SettingsSection: React.FC<SettingsSectionProps> = ({
  id,
  title,
  description,
  children,
  className,
  contentClassName,
  headerActions,
}) => {
  return (
    <section
      id={id}
      data-settings-section={id ?? title}
      className={clsx("border-t border-border/60 pt-8 first:border-t-0 first:pt-0", className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="text-base font-semibold text-text-primary sm:text-lg">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-sm leading-6 text-text-secondary">
              {description}
            </p>
          ) : null}
        </div>
        {headerActions ? (
          <div className="flex shrink-0 items-center gap-2">
            {headerActions}
          </div>
        ) : null}
      </div>

      <div className={clsx("mt-4 space-y-4", contentClassName)}>{children}</div>
    </section>
  );
};

export default SettingsSection;
