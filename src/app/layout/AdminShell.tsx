import React from 'react';
import { Outlet } from 'react-router-dom';
import { AdminSidebar } from './AdminSidebar';
import { AdminTopbar } from './AdminTopbar';
import { PageContainer } from '@/components/PageContainer';

export const AdminShell: React.FC = () => {
  return (
    <div className="ds-admin-shell">
      <AdminSidebar />
      <div className="ds-admin-main">
        <AdminTopbar />
        <PageContainer>
          <Outlet />
        </PageContainer>
      </div>
    </div>
  );
};
