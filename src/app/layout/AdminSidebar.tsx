import React from 'react';

import { appConfig } from '@/config/appConfig';
import { useAuthStore } from '@/store/authStore';
import { toDisplayRole } from '@/utils/role';
import { SidebarNavSection } from './SidebarNavSection';
import { SIDEBAR_SECTIONS, navItems } from './navigationConfig';

interface AdminSidebarProps {
  collapsed?: boolean;
  id?: string;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({ collapsed = false, id }) => {
  const user = useAuthStore((state) => state.user);
  const roleLabel = toDisplayRole(user?.role).replace('_', ' ');

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

          if (!items.length) {
            return null;
          }

          return (
            <SidebarNavSection
              key={section.key}
              label={section.label}
              description={section.description}
              itemCount={items.length}
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
            <strong>{user?.username?.trim() || user?.email || 'Admin workspace'}</strong>
            <span>{roleLabel}</span>
            <div className="ds-sidebar-footer-chips" aria-hidden>
              <span className="ds-shell-chip">{appConfig.environmentLabel}</span>
              <span className="ds-shell-chip ds-shell-chip--ghost">{appConfig.liveUpdatesLabel}</span>
              <span className="ds-shell-chip ds-shell-chip--ghost">Ctrl K</span>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
