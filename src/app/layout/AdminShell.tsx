import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';

import { PageContainer } from '@/components/PageContainer';
import { AdminSidebar } from './AdminSidebar';
import { AdminTopbar } from './AdminTopbar';

export const AdminShell: React.FC = () => {
  const [collapsed, setCollapsed] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 992 : false,
  );

  const toggleSidebar = () => setCollapsed((state) => !state);

  return (
    <div className={`ds-admin-shell ${collapsed ? 'is-collapsed' : ''}`}>
      <a className="ds-skip-link" href="#main-content">
        Bỏ qua đến nội dung chính
      </a>
      <AdminSidebar id="app-sidebar" collapsed={collapsed} />
      <button
        type="button"
        className="ds-admin-sidebar-backdrop"
        aria-label="Close navigation"
        onClick={toggleSidebar}
      />
      <div className="ds-admin-main">
        <AdminTopbar collapsed={collapsed} onToggleSidebar={toggleSidebar} />
        <main id="main-content" className="ds-admin-main-content" role="main">
          <PageContainer>
            <Outlet />
          </PageContainer>
        </main>
      </div>
    </div>
  );
};
