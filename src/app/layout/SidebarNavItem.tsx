import { NavLink } from 'react-router-dom';

import { AppIcon } from '@/components/AppIcon';
import { useAuthStore } from '@/store/authStore';
import { hasSomeRole } from '@/utils/role';
import type { NavItem as NavItemType } from './navigationConfig';

interface SidebarNavItemProps {
  item: NavItemType;
  isSubmenu?: boolean;
}

export const SidebarNavItem = ({ item, isSubmenu = false }: SidebarNavItemProps) => {
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
      aria-label={item.label}
    >
      <span className="ds-sidebar-item-marker" aria-hidden />
      <span className="ds-sidebar-item-icon">
        <AppIcon name={item.iconKey} size={18} aria-hidden />
      </span>
      <span className="ds-sidebar-item-content">
        <span className="ds-sidebar-item-label">{item.label}</span>
      </span>
    </NavLink>
  );
};
