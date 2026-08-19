import React from "react";
import clsx from "clsx";

interface ModuleSidebarProps {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

export const ModuleSidebar: React.FC<ModuleSidebarProps> = ({
  title,
  description,
  action,
  children,
  className,
  contentClassName,
}) => {
  return (
    <aside className={clsx("hc-module-sidebar", className)}>
      {(title || action) && (
        <div className="hc-module-sidebar__header">
          <div className="min-w-0">
            {title && <h1 className="hc-module-sidebar__title">{title}</h1>}
            {description && (
              <p className="hc-module-sidebar__description">{description}</p>
            )}
          </div>
          {action}
        </div>
      )}
      <div className={clsx("hc-module-sidebar__content", contentClassName)}>
        {children}
      </div>
    </aside>
  );
};

export default ModuleSidebar;
