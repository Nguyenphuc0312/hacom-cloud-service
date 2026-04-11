import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';

import { RequireAuth } from '@/app/guards/RequireAuth';
import { AppLayout } from '@/app/layout/AppLayout';
import { QueryStateView } from '@/components/QueryStates';

const LoginPage = lazy(() =>
  import('@/features/auth/pages/LoginPage').then((module) => ({ default: module.LoginPage })),
);
const DashboardPage = lazy(() =>
  import('@/features/dashboard/pages/DashboardPage').then((module) => ({
    default: module.DashboardPage,
  })),
);
const UsersPage = lazy(() =>
  import('@/features/users/pages/UsersPage').then((module) => ({ default: module.UsersPage })),
);
const UserDetailPage = lazy(() =>
  import('@/features/users/pages/UserDetailPage').then((module) => ({
    default: module.UserDetailPage,
  })),
);
const HREmployeesPage = lazy(() =>
  import('@/features/hr-employees/pages/HREmployeesPage').then((module) => ({
    default: module.HREmployeesPage,
  })),
);
const AuditLogPage = lazy(() =>
  import('@/features/audit/pages/AuditLogPage').then((module) => ({
    default: module.AuditLogPage,
  })),
);
const ServicesPage = lazy(() =>
  import('@/features/services/pages/ServicesPage').then((module) => ({
    default: module.ServicesPage,
  })),
);

const withSuspense = (element: ReactNode) => (
  <Suspense fallback={<QueryStateView kind="loading" title="Đang tải trang..." />}>
    {element}
  </Suspense>
);

const routes = [
  {
    path: '/login',
    element: withSuspense(<LoginPage />),
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
        element: withSuspense(<DashboardPage />),
      },
      {
        path: 'services',
        element: <Navigate to="/services/health" replace />,
      },
      {
        path: 'services/:section',
        element: withSuspense(<ServicesPage />),
      },
      {
        path: 'users',
        element: withSuspense(<UsersPage />),
      },
      {
        path: 'users/:id',
        element: withSuspense(<UserDetailPage />),
      },
      {
        path: 'hr-employees',
        element: withSuspense(<HREmployeesPage />),
      },
      {
        path: 'audit',
        element: withSuspense(<AuditLogPage />),
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
