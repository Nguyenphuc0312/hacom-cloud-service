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
        "border-r border-border bg-surface-raised/95 backdrop-blur-sm",
        "lg:transition-[width] lg:duration-200",
        collapsed ? "lg:w-sidebar-collapsed" : "lg:w-sidebar-expanded",
        className,
      )}
      aria-label="Sidebar"
    >
      {children}
    </aside>
  );
};

export default SidebarContainer;
