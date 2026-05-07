import React from "react";
import clsx from "clsx";

interface SettingsCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  bodyClassName?: string;
}

export const SettingsCard: React.FC<SettingsCardProps> = ({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  ...props
}) => {
  return (
    <div
      className={clsx(
        "overflow-hidden rounded-xl border border-border bg-surface",
        className,
      )}
      {...props}
    >
      {title || description || actions ? (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
          <div className="min-w-0">
            {title ? (
              <h3 className="text-sm font-semibold text-text-primary">
                {title}
              </h3>
            ) : null}
            {description ? (
              <p className="mt-1 max-w-2xl text-sm leading-6 text-text-secondary">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          ) : null}
        </div>
      ) : null}
      <div className={clsx("p-4 sm:p-5", bodyClassName)}>{children}</div>
    </div>
  );
};

export default SettingsCard;
