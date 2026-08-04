import React from "react";
import clsx from "clsx";

interface SettingsFieldGroupProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

export const SettingsFieldGroup: React.FC<SettingsFieldGroupProps> = ({
  title,
  description,
  children,
  className,
  contentClassName,
}) => {
  return (
    <div
      className={clsx(
        "rounded-2xl border border-border bg-surface p-4 shadow-[0_1px_2px_rgb(15_23_42_/_0.06)] sm:p-5",
        className,
      )}
    >
      {title || description ? (
        <div className="mb-4">
          {title ? (
            <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          ) : null}
          {description ? (
            <p className="mt-1 text-sm leading-6 text-text-secondary">
              {description}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className={clsx(contentClassName ?? "space-y-4")}>{children}</div>
    </div>
  );
};

export default SettingsFieldGroup;
