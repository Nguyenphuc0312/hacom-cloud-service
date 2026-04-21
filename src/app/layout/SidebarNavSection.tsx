import type { ReactNode } from 'react';

import type { NavItem as NavItemType } from './navigationConfig';
import { SidebarNavItem } from './SidebarNavItem';

interface SidebarNavSectionProps {
  label: string;
  items: NavItemType[];
  icon?: ReactNode;
}

export const SidebarNavSection = ({ label, items, icon }: SidebarNavSectionProps) => (
  <div className="ds-sidebar-section">
    <div className="ds-sidebar-section-label">
      <span className="ds-sidebar-section-label-main">
        {icon ? <span className="ds-sidebar-section-icon">{icon}</span> : null}
        <span>{label}</span>
      </span>
    </div>

    <div className="ds-sidebar-section-list">
      {items.map((item) => (
        <div key={item.key}>
          <SidebarNavItem item={item} />
          {item.children && item.children.length > 0 ? (
            <div className="ds-sidebar-submenu">
              {item.children.map((child) => (
                <SidebarNavItem key={child.key} item={child} isSubmenu />
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  </div>
);
