import React from 'react';
import { SidebarNavSection } from './SidebarNavSection';
import { navItems, SIDEBAR_SECTIONS } from './navigationConfig';

interface AdminSidebarProps {
  collapsed?: boolean;
  id?: string;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({ collapsed = false, id }) => {
  return (
    <aside
      id={id}
      className={`ds-admin-sidebar ${collapsed ? 'is-collapsed' : ''}`}
      aria-label="Primary navigation"
    >
      <div className="ds-admin-sidebar-logo" aria-label="Chat Admin Panel">
        <span className="ds-sidebar-brand-mark">CA</span>
        {!collapsed && (
          <span className="ds-sidebar-brand-copy">
            <strong>Chat Admin</strong>
            <small>Control Center</small>
          </span>
        )}
      </div>
      <nav className="ds-admin-sidebar-nav" role="navigation" aria-label="Main navigation">
        {SIDEBAR_SECTIONS.map((section) => {
          const items = navItems.filter((item) => item.section === section.key);
          if (!items.length) return null;
          return (
            <SidebarNavSection
              key={section.key}
              label={section.label}
              items={items}
              icon={section.icon}
              collapsed={collapsed}
            />
          );
        })}
      </nav>
      <div className="ds-admin-sidebar-footer">
        {!collapsed && (
          <div className="ds-sidebar-footer-meta">
            <strong>Admin Workspace</strong>
            <span>Production</span>
          </div>
        )}
      </div>
    </aside>
  );
};
