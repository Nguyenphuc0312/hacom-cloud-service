import type { ReactNode } from 'react';

import type { NavItem as NavItemType } from './navigationConfig';
import { SidebarNavItem } from './SidebarNavItem';

interface SidebarNavSectionProps {
  label: string;
  description?: string;
  itemCount?: number;
  items: NavItemType[];
  icon?: ReactNode;
  collapsed?: boolean;
}

export const SidebarNavSection = ({
  label,
  description,
  itemCount,
  items,
  icon,
  collapsed = false,
}: SidebarNavSectionProps) => (
  <div className="ds-sidebar-section">
    <div className="ds-sidebar-section-label" title={collapsed ? label : undefined}>
      <span className="ds-sidebar-section-label-main">
        {icon && <span className="ds-sidebar-section-icon">{icon}</span>}
        {!collapsed && <span>{label}</span>}
      </span>
      {!collapsed && (
        <span className="ds-sidebar-section-meta">
          {description ? <span>{description}</span> : null}
          {typeof itemCount === 'number' ? (
            <span className="ds-sidebar-section-count">{itemCount}</span>
          ) : null}
        </span>
      )}
    </div>

    <div className="ds-sidebar-section-list">
      {items.map((item) => (
        <span key={item.key}>
          <SidebarNavItem item={item} collapsed={collapsed} />
          {item.children && item.children.length > 0 && (
            <div className="ds-sidebar-submenu">
              {item.children.map((child) => (
                <SidebarNavItem key={child.key} item={child} isSubmenu collapsed={collapsed} />
              ))}
            </div>
          )}
        </span>
      ))}
    </div>
  </div>
);
