import React from 'react';

import { AppIcon } from '@/components/AppIcon/AppIcon';
import { useAuthStore } from '@/store/authStore/authStore';
import { hasSomeRole, toDisplayRole } from '@/utils/role/role';
import { SidebarNavSection } from '../SidebarNavSection/SidebarNavSection';
import { SIDEBAR_SECTIONS, navItems } from '../navigationConfig/navigationConfig';

import './AdminSidebar-01.css';
import './AdminSidebar-02.css';
import './AdminSidebar-03.css';
import './AdminSidebar-04.css';
interface AdminSidebarProps {
  mobile?: boolean;
  id?: string;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({ mobile = false, id }) => {
  const user = useAuthStore((state) => state.user);
  const roleLabel = toDisplayRole(user?.role).replace('_', ' ');
  const visibleItems = navItems.filter((item) => !item.roles || hasSomeRole(user?.role, item.roles));
  const sections = SIDEBAR_SECTIONS.map((section) => ({
    ...section,
    items: visibleItems.filter((item) => item.section === section.key),
  })).filter((section) => section.items.length > 0);

  return (
    <aside
      id={id}
      className={`ds-admin-sidebar ${mobile ? 'is-mobile' : ''}`}
      aria-label="Điều hướng chính"
    >
      <div className="ds-admin-sidebar-logo" aria-label="Panel vận hành admin">
        <span className="ds-sidebar-brand-mark">
          <AppIcon name="shield" size={18} strokeWidth={2.1} aria-hidden />
        </span>
        <span className="ds-sidebar-brand-copy">
          <strong>Admin Console</strong>
          <small>Quản trị vận hành</small>
        </span>
      </div>

      <nav className="ds-admin-sidebar-nav" role="navigation" aria-label="Điều hướng chính">
        <div className="ds-sidebar-nav-list">
          {sections.map((section) => (
            <SidebarNavSection
              key={section.key}
              label={section.label}
              iconKey={section.iconKey}
              items={section.items}
            />
          ))}
        </div>
      </nav>

      <div className="ds-admin-sidebar-footer">
        <div className="ds-sidebar-footer-meta">
          <strong>{user?.username?.trim() || user?.email || 'Không gian admin'}</strong>
          <span>{roleLabel}</span>
        </div>
      </div>
    </aside>
  );
};
