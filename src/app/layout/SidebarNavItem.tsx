import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export const SidebarNavItem = ({ item }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const active = location.pathname.startsWith(item.route);
  return (
    <button
      className={`ds-sidebar-item${active ? ' is-active' : ''}`}
      onClick={() => navigate(item.route)}
      aria-current={active ? 'page' : undefined}
    >
      {item.icon && <span className="ds-sidebar-item-icon">{item.icon}</span>}
      <span className="ds-sidebar-item-label">{item.label}</span>
      {item.badge && <span className="ds-sidebar-item-badge">{item.badge}</span>}
    </button>
  );
};
