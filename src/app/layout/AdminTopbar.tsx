import React from 'react';
import { useLocation } from 'react-router-dom';
import { TopbarSearch } from './TopbarSearch';
import { TopbarActions } from './TopbarActions';
import { breadcrumbNameMap } from './navigationConfig';

interface AdminTopbarProps {
  collapsed?: boolean;
  onToggleSidebar?: () => void;
}

export const AdminTopbar: React.FC<AdminTopbarProps> = ({ collapsed = false, onToggleSidebar }) => {
  const location = useLocation();
  const matchedPath =
    Object.keys(breadcrumbNameMap)
      .sort((a, b) => b.length - a.length)
      .find((path) =>
        path === '/'
          ? location.pathname === '/'
          : location.pathname === path || location.pathname.startsWith(`${path}/`),
      ) || '/';
  const currentPageTitle = breadcrumbNameMap[matchedPath] || 'Dashboard';

  return (
    <header className="ds-admin-topbar" role="banner">
      <div className="ds-admin-topbar-left">
        <button
          type="button"
          className="ds-topbar-toggle ds-btn ds-btn--icon"
          aria-label={collapsed ? 'Mở thanh bên' : 'Thu nhỏ thanh bên'}
          aria-expanded={!collapsed}
          aria-controls="app-sidebar"
          onClick={onToggleSidebar}
        >
          <span className="ds-icon">{collapsed ? '☰' : '≡'}</span>
        </button>
        <div className="ds-topbar-title-block">
          <span className="ds-topbar-eyebrow">Admin Console</span>
          <strong className="ds-topbar-page-title">{currentPageTitle}</strong>
        </div>
      </div>
      <div className="ds-admin-topbar-center">
        <TopbarSearch />
      </div>
      <div className="ds-admin-topbar-right">
        <TopbarActions />
        {/* Profile menu here */}
      </div>
    </header>
  );
};
