import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { AdminSidebar } from './AdminSidebar';
import { AdminTopbar } from './AdminTopbar';
import { PageContainer } from '@/components/PageContainer';

export const AdminShell: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);

  const toggleSidebar = () => setCollapsed((s) => !s);

  return (
    <div className={`ds-admin-shell ${collapsed ? 'is-collapsed' : ''}`}>
      <a className="ds-skip-link" href="#main-content">
        Bỏ qua đến nội dung chính
      </a>
      <AdminSidebar id="app-sidebar" collapsed={collapsed} />
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
