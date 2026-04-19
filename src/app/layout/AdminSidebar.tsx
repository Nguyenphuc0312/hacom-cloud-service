import React from 'react';

import { appConfig } from '@/config/appConfig';
import { useAuthStore } from '@/store/authStore';
import { toDisplayRole } from '@/utils/role';
import { SidebarNavItem } from './SidebarNavItem';
import { navItems } from './navigationConfig';

interface AdminSidebarProps {
  collapsed?: boolean;
  id?: string;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({ collapsed = false, id }) => {
  const user = useAuthStore((state) => state.user);
  const roleLabel = toDisplayRole(user?.role).replace('_', ' ');
  const primaryItems = navItems;

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
          {primaryItems.map((item) => (
            <SidebarNavItem key={item.key} item={item} collapsed={collapsed} />
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
