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
      <div className="ds-admin-sidebar-logo">{collapsed ? 'CA' : 'Chat Admin'}</div>
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
            />
          );
        })}
      </nav>
      <div className="ds-admin-sidebar-footer">{/* Profile/Context here */}</div>
    </aside>
  );
};
