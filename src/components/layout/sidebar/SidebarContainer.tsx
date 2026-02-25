import React from "react";
import clsx from "clsx";

interface SidebarContainerProps {
  collapsed: boolean;
  className?: string;
  children: React.ReactNode;
}

export const SidebarContainer: React.FC<SidebarContainerProps> = ({
  collapsed,
  className,
  children,
}) => {
  return (
    <aside
      className={clsx(
        "flex h-full min-h-0 w-full flex-col overflow-hidden",
        "border-r border-slate-200 bg-white/95 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/95",
        "lg:transition-[width] lg:duration-200",
        collapsed ? "lg:w-[88px]" : "lg:w-[304px]",
        className,
      )}
      aria-label="Sidebar"
    >
      {children}
    </aside>
  );
};

export default SidebarContainer;
