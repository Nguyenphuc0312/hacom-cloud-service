import { NavLink } from 'react-router-dom';

import { useAuthStore } from '@/store/authStore';
import { hasSomeRole } from '@/utils/role';
import type { NavItem as NavItemType } from './navigationConfig';

interface SidebarNavItemProps {
  item: NavItemType;
  isSubmenu?: boolean;
  collapsed?: boolean;
}

export const SidebarNavItem = ({
  item,
  isSubmenu = false,
  collapsed = false,
}: SidebarNavItemProps) => {
  const currentRole = useAuthStore((state) => state.user?.role);

  if (item.roles && item.roles.length > 0) {
    if (!hasSomeRole(currentRole, item.roles)) {
      return null;
    }
  }

  return (
    <NavLink
      to={item.route}
      end={item.route === '/'}
      className={({ isActive }) =>
        `ds-sidebar-item${isActive ? ' is-active' : ''}${isSubmenu ? ' is-submenu' : ''}`
      }
      title={collapsed ? item.label : undefined}
      aria-label={item.label}
    >
      <span className="ds-sidebar-item-marker" aria-hidden />
      {item.icon && <span className="ds-sidebar-item-icon">{item.icon}</span>}
      <span className="ds-sidebar-item-content">
        <span className="ds-sidebar-item-label">{item.label}</span>
      </span>
    </NavLink>
  );
};
