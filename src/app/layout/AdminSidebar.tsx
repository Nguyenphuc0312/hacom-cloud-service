import React from 'react';

import { appConfig } from '@/config/appConfig';
import { useAuthStore } from '@/store/authStore';
import { hasSomeRole, toDisplayRole } from '@/utils/role';
import { SidebarNavSection } from './SidebarNavSection';
import { SIDEBAR_SECTIONS, navItems } from './navigationConfig';

interface AdminSidebarProps {
  collapsed?: boolean;
  id?: string;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({ collapsed = false, id }) => {
  const user = useAuthStore((state) => state.user);
  const roleLabel = toDisplayRole(user?.role).replace('_', ' ');
  const visibleItems = navItems.filter(
    (item) => !item.roles || hasSomeRole(user?.role, item.roles),
  );
  const sections = SIDEBAR_SECTIONS.map((section) => ({
    ...section,
    items: visibleItems.filter((item) => item.section === section.key),
  })).filter((section) => section.items.length > 0);

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
        <div className="ds-sidebar-nav-list">
          {sections.map((section) => (
            <SidebarNavSection
              key={section.key}
              label={section.label}
              description={section.description}
              icon={section.icon}
              itemCount={section.items.length}
              items={section.items}
              collapsed={collapsed}
            />
          ))}
        </div>
      </nav>

      <div className="ds-admin-sidebar-footer">
        {!collapsed && (
          <div className="ds-sidebar-footer-meta">
            <strong>{user?.username?.trim() || user?.email || 'Admin workspace'}</strong>
            <span>{roleLabel}</span>
            <span className="ds-sidebar-footer-environment">{appConfig.environmentLabel}</span>
          </div>
        )}
      </div>
    </aside>
  );
};
