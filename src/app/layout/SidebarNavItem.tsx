import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// Optionally pass isSubmenu for submenu styling
export const SidebarNavItem = ({ item, isSubmenu = false }) => {
  const location = useLocation();
  const navigate = useNavigate();
  // Role-based visibility (if roles prop present)
  // TODO: Replace with actual user roles from context/store if available
  if (item.roles && item.roles.length > 0) {
    // Example: const userRoles = useCurrentUser()?.roles || [];
    const userRoles = [];
    if (!item.roles.some((role) => userRoles.includes(role))) return null;
  }
  const active = location.pathname.startsWith(item.route);
  return (
    <button
      className={`ds-sidebar-item${active ? ' is-active' : ''}${isSubmenu ? ' is-submenu' : ''}`}
      onClick={() => navigate(item.route)}
      aria-current={active ? 'page' : undefined}
    >
      {item.icon && <span className="ds-sidebar-item-icon">{item.icon}</span>}
      <span className="ds-sidebar-item-label">{item.label}</span>
      {item.badge && <span className="ds-sidebar-item-badge">{item.badge}</span>}
    </button>
  );
};
