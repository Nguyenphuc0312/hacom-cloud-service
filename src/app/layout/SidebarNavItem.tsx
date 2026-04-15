import { useLocation, useNavigate } from 'react-router-dom';

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
  const location = useLocation();
  const navigate = useNavigate();

  if (item.roles && item.roles.length > 0) {
    const userRoles: string[] = [];

    if (!item.roles.some((role) => userRoles.includes(role))) {
      return null;
    }
  }

  const active =
    item.route === '/' ? location.pathname === '/' : location.pathname.startsWith(item.route);

  return (
    <button
      type="button"
      className={`ds-sidebar-item${active ? ' is-active' : ''}${isSubmenu ? ' is-submenu' : ''}`}
      onClick={() => navigate(item.route)}
      title={collapsed ? item.label : undefined}
      aria-label={item.label}
      aria-current={active ? 'page' : undefined}
    >
      <span className="ds-sidebar-item-marker" aria-hidden />
      {item.icon && <span className="ds-sidebar-item-icon">{item.icon}</span>}
      <span className="ds-sidebar-item-content">
        <span className="ds-sidebar-item-label">{item.label}</span>
      </span>
    </button>
  );
};
