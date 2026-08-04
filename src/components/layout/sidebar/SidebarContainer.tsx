import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";

interface SidebarContainerProps {
  className?: string;
  children: React.ReactNode;
}

export const SidebarContainer: React.FC<SidebarContainerProps> = ({
  className,
  children,
}) => {
  const { t } = useTranslation();

  return (
    <aside
      className={clsx(
        "flex h-full min-h-0 w-full flex-col overflow-hidden",
        "bg-[hsl(var(--chat-panel-bg))]",
        "lg:w-full",
        className,
      )}
      aria-label={t("sidebar:sidebar.aria")}
    >
      {children}
    </aside>
  );
};

export default SidebarContainer;
