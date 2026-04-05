import { createBrowserRouter, Navigate } from 'react-router-dom';

import { RequireAuth } from '@/app/guards/RequireAuth';
import { AppLayout } from '@/app/layout/AppLayout';
import { AuditLogPage } from '@/features/audit/pages/AuditLogPage';
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { HREmployeesPage } from '@/features/hr-employees/pages/HREmployeesPage';
import { ServicesPage } from '@/features/services/pages/ServicesPage';
import { UserDetailPage } from '@/features/users/pages/UserDetailPage';
import { UsersPage } from '@/features/users/pages/UsersPage';

const routes = [
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
];

const rawBaseName = import.meta.env.BASE_URL || '/';
const baseName =
  rawBaseName.endsWith('/') && rawBaseName !== '/' ? rawBaseName.slice(0, -1) : rawBaseName;

export const router = createBrowserRouter(routes, {
  basename: baseName === '/' ? undefined : baseName,
});
