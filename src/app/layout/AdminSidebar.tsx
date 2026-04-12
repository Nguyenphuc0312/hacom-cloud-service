import React from 'react';
import { SidebarNavSection } from './SidebarNavSection';
import { navItems, SIDEBAR_SECTIONS } from './navigationConfig';

export const AdminSidebar: React.FC = () => {
  return (
    <aside className="ds-admin-sidebar">
      <div className="ds-admin-sidebar-logo">Chat Admin</div>
      <nav className="ds-admin-sidebar-nav">
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
