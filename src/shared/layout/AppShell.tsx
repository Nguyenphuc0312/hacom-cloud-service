import React from "react";
import clsx from "clsx";

interface AppShellProps extends React.HTMLAttributes<HTMLDivElement> {
  moduleSidebar?: React.ReactNode;
  rightPanel?: React.ReactNode;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  moduleSidebar,
  rightPanel,
  children,
  className,
  ...props
}) => {
  return (
    <div className={clsx("hc-app-shell", className)} {...props}>
      {moduleSidebar}
      <main className="hc-app-shell__main">{children}</main>
      {rightPanel}
    </div>
  );
};

export default AppShell;
