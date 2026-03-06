import { createBrowserRouter } from 'react-router-dom';

import { RequireAuth } from '@/app/guards/RequireAuth';
import { RequireRole } from '@/app/guards/RequireRole';
import { AppLayout } from '@/app/layout/AppLayout';
import { AdminUsersPage } from '@/features/adminUsers/pages/AdminUsersPage';
import { AlertsPage } from '@/features/alerts/pages/AlertsPage';
import { AuditLogPage } from '@/features/audit/pages/AuditLogPage';
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { PerformancePage } from '@/features/performance/pages/PerformancePage';
import { ServicesPage } from '@/features/services/pages/ServicesPage';
import { SmtpSettingsPage } from '@/features/smtp/pages/SmtpSettingsPage';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      {
        index: true,
        element: <DashboardPage />,
      },
      {
        path: 'services',
        element: <ServicesPage />,
      },
      {
        path: 'performance',
        element: <PerformancePage />,
      },
      {
        path: 'settings/smtp',
        element: (
          <RequireRole minimumRole="admin">
            <SmtpSettingsPage />
          </RequireRole>
        ),
      },
      {
        path: 'alerts',
        element: <AlertsPage />,
      },
      {
        path: 'audit',
        element: (
          <RequireRole minimumRole="admin">
            <AuditLogPage />
          </RequireRole>
        ),
      },
      {
        path: 'admin-users',
        element: (
          <RequireRole minimumRole="superadmin">
            <AdminUsersPage />
          </RequireRole>
        ),
      },
    ],
  },
]);
