import React from "react";
import clsx from "clsx";
import { AppPage } from "../layout/AppPage";

interface SettingsPageShellProps {
  header: React.ReactNode;
  sidebar?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const SettingsPageShell: React.FC<SettingsPageShellProps> = ({
  header,
  sidebar,
  children,
  className,
}) => {
  return (
    <AppPage className={clsx("h-full", className)}>
      {header}
      <div
        data-settings-shell="true"
        className="flex h-full min-h-0 flex-1 overflow-hidden bg-background px-4 py-4 sm:px-5 lg:px-6"
      >
        <div
          className={clsx(
            "h-full min-h-0 min-w-0 flex-1 overflow-hidden",
            sidebar
              ? "grid gap-4 md:grid-cols-[17rem,minmax(0,1fr)] xl:grid-cols-[18rem,minmax(0,1fr)] lg:gap-6"
              : "flex",
          )}
        >
          {sidebar}
          {children}
        </div>
      </div>
    </AppPage>
  );
};

export default SettingsPageShell;
