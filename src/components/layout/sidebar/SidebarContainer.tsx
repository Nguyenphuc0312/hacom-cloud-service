import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();

  return (
    <aside
      className={clsx(
        "flex h-full min-h-0 w-full flex-col overflow-hidden",
        "border-r border-border/70 bg-[hsl(var(--color-sidebar-surface))]",
        "lg:transition-[width] lg:duration-200",
        collapsed ? "lg:w-sidebar-collapsed" : "lg:w-sidebar-expanded",
        className,
      )}
      aria-label={t("sidebar:sidebar.aria")}
    >
      {children}
    </aside>
  );
};

export default SidebarContainer;
