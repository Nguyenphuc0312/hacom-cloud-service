import React from 'react';
import { SidebarNavItem } from './SidebarNavItem';

export const SidebarNavSection = ({ label, items, icon }) => (
  <div className="ds-sidebar-section">
    <div className="ds-sidebar-section-label">
      {icon && <span className="ds-sidebar-section-icon">{icon}</span>}
      {label}
    </div>
    <div className="ds-sidebar-section-list">
      {items.map((item) => (
        <React.Fragment key={item.key}>
          <SidebarNavItem item={item} />
          {item.children && item.children.length > 0 && (
            <div className="ds-sidebar-submenu">
              {item.children.map((child) => (
                <SidebarNavItem key={child.key} item={child} isSubmenu />
              ))}
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  </div>
);
