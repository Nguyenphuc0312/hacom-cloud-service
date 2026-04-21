import React from "react";
import clsx from "clsx";

interface SettingsProfileSummaryProps {
  avatar: React.ReactNode;
  title: string;
  subtitle?: string;
  status?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const SettingsProfileSummary: React.FC<SettingsProfileSummaryProps> = ({
  avatar,
  title,
  subtitle,
  status,
  meta,
  actions,
  className,
}) => {
  return (
    <div
      className={clsx(
        "rounded-2xl border border-border/70 bg-[hsl(var(--color-surface))/0.92] p-4 shadow-[0_1px_2px_hsl(var(--color-background)/0.04)] sm:p-5",
        className,
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div className="shrink-0">{avatar}</div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-lg font-semibold text-text-primary">
                {title}
              </h3>
              {status}
            </div>
            {subtitle ? (
              <p className="mt-1 truncate text-sm text-text-secondary">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
      {meta ? (
        <div className="mt-4 border-t border-border/60 pt-4">{meta}</div>
      ) : null}
    </div>
  );
};

export default SettingsProfileSummary;
