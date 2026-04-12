import { SidebarNavItem } from './SidebarNavItem';
import type { NavItem as NavItemType } from './navigationConfig';
import type { ReactNode } from 'react';

interface SidebarNavSectionProps {
  label: string;
  items: NavItemType[];
  icon?: ReactNode;
  collapsed?: boolean;
}

export const SidebarNavSection = ({
  label,
  items,
  icon,
  collapsed = false,
}: SidebarNavSectionProps) => (
  <div className="ds-sidebar-section">
    <div className="ds-sidebar-section-label" title={collapsed ? label : undefined}>
      {icon && <span className="ds-sidebar-section-icon">{icon}</span>}
      {label}
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
