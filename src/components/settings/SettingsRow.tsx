import React from "react";
import clsx from "clsx";

interface SettingsRowProps {
  label: string;
  description?: string;
  icon?: React.ReactNode;
  meta?: React.ReactNode;
  control?: React.ReactNode;
  className?: string;
}

export const SettingsRow: React.FC<SettingsRowProps> = ({
  label,
  description,
  icon,
  meta,
  control,
  className,
}) => {
  return (
    <div
      className={clsx(
        "flex min-w-0 items-center gap-3 px-0 py-4 first:pt-0 last:pb-0",
        className,
      )}
    >
      {icon ? (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-overlay text-text-secondary">
          {icon}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-primary">{label}</p>
        {description ? (
          <p className="mt-1 break-words text-sm leading-5 text-text-secondary">
            {description}
          </p>
        ) : null}
        {meta ? <div className="mt-2">{meta}</div> : null}
      </div>
      {control ? <div className="shrink-0">{control}</div> : null}
    </div>
  );
};

export default SettingsRow;
