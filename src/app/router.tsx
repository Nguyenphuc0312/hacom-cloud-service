import { createBrowserRouter } from 'react-router-dom';
import { Navigate } from 'react-router-dom';

import { RequireAuth } from '@/app/guards/RequireAuth';
import { AppLayout } from '@/app/layout/AppLayout';
import { AuditLogPage } from '@/features/audit/pages/AuditLogPage';
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { HREmployeesPage } from '@/features/hr-employees/pages/HREmployeesPage';
import { ServicesPage } from '@/features/services/pages/ServicesPage';
import { UserDetailPage } from '@/features/users/pages/UserDetailPage';
import { UsersPage } from '@/features/users/pages/UsersPage';

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
        path: 'users',
        element: <UsersPage />,
      },
      {
        path: 'users/:id',
        element: <UserDetailPage />,
      },
      {
        path: 'hr-employees',
        element: <HREmployeesPage />,
      },
      {
        path: 'audit',
        element: <AuditLogPage />,
      },
      {
        path: '*',
        element: <Navigate to="/" replace />,
      },
    ],
  },
]);
