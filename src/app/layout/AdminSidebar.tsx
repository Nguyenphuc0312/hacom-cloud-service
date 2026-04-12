import React from 'react';
import { SidebarNavSection } from './SidebarNavSection';
import { navItems } from './navigationConfig';

export const AdminSidebar: React.FC = () => {
  // Group navItems by section
  const groups = Array.from(
    navItems.reduce((map, item) => {
      if (!map.has(item.group)) map.set(item.group, []);
      map.get(item.group)?.push(item);
      return map;
    }, new Map()),
  );

  return (
    <aside className="ds-admin-sidebar">
      <div className="ds-admin-sidebar-logo">Chat Admin</div>
      <nav className="ds-admin-sidebar-nav">
        {groups.map(([group, items]) => (
          <SidebarNavSection key={group} label={group} items={items} />
        ))}
      </nav>
      <div className="ds-admin-sidebar-footer">{/* Profile/Context here */}</div>
    </aside>
  );
};
