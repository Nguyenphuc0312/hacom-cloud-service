import React from "react";
import clsx from "clsx";

interface SettingsDangerZoneProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export const SettingsDangerZone: React.FC<SettingsDangerZoneProps> = ({
  title,
  description,
  children,
  className,
}) => {
  return (
    <div
      className={clsx(
        "rounded-2xl border border-danger/25 bg-danger/5 p-4 sm:p-5",
        className,
      )}
    >
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-danger">{title}</h3>
        {description ? (
          <p className="mt-1 text-sm leading-6 text-text-secondary">
            {description}
          </p>
        ) : null}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
};

export default SettingsDangerZone;
