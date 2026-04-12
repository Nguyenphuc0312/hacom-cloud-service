import React from 'react';
import { TopbarSearch } from './TopbarSearch';
import { TopbarActions } from './TopbarActions';

interface AdminTopbarProps {
  collapsed?: boolean;
  onToggleSidebar?: () => void;
}

export const AdminTopbar: React.FC<AdminTopbarProps> = ({ collapsed = false, onToggleSidebar }) => {
  return (
    <header className="ds-admin-topbar">
      <div className="ds-admin-topbar-left">
        <button
          className="ds-topbar-toggle ds-btn ds-btn--icon"
          aria-label={collapsed ? 'Mở thanh bên' : 'Thu nhỏ thanh bên'}
          aria-expanded={!collapsed}
          aria-controls="app-sidebar"
          onClick={onToggleSidebar}
        >
          <span className="ds-icon">{collapsed ? '☰' : '≡'}</span>
        </button>
        {/* Breadcrumb or Page Title here */}
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
