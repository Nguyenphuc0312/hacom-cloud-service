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
  // Role-based visibility (if roles prop present)
  // TODO: Replace with actual user roles from context/store if available
  if (item.roles && item.roles.length > 0) {
    // Example: const userRoles: string[] = useCurrentUser()?.roles || [];
    const userRoles: string[] = [];
    if (!item.roles.some((role: string) => userRoles.includes(role))) return null;
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
      {item.icon && <span className="ds-sidebar-item-icon">{item.icon}</span>}
      <span className="ds-sidebar-item-label">{item.label}</span>
      {item.badge && <span className="ds-sidebar-item-badge">{item.badge}</span>}
    </button>
  );
};
