import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';

import { RequireAuth } from '@/app/guards/RequireAuth';
import { RequireApprovedAccess } from '@/app/guards/RequireApprovedAccess';
import { RequireRole } from '@/app/guards/RequireRole';
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
const MonitoringOverviewPage = lazy(() =>
  import('@/features/monitoring/pages/MonitoringOverviewPage').then((module) => ({
    default: module.MonitoringOverviewPage,
  })),
);
const AccessPendingPage = lazy(() =>
  import('@/features/access/pages/AccessPendingPage').then((module) => ({
    default: module.AccessPendingPage,
  })),
);
const AccessRequestsPage = lazy(() =>
  import('@/features/access/pages/AccessRequestsPage').then((module) => ({
    default: module.AccessRequestsPage,
  })),
);
const AuthorityPage = lazy(() =>
  import('@/features/authority/pages/AuthorityPage').then((module) => ({
    default: module.AuthorityPage,
  })),
);

const withSuspense = (element: ReactNode) => (
  <Suspense fallback={<QueryStateView kind="loading" title="Loading page..." />}>
    {element}
  </Suspense>
);

const routes = [
  {
    path: '/login',
    element: withSuspense(<LoginPage />),
  },
  {
    path: '/access',
    element: (
      <RequireAuth>
        {withSuspense(<AccessPendingPage />)}
      </RequireAuth>
    ),
  },
  {
    path: '/',
    element: (
      <RequireAuth>
        <RequireApprovedAccess>
          <AppLayout />
        </RequireApprovedAccess>
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
        path: 'monitoring',
        element: withSuspense(<MonitoringOverviewPage />),
      },
      {
        path: 'users',
        element: withSuspense(<UsersPage />),
      },
      {
        path: 'authority',
        element: (
          <RequireRole roles={['super_admin']}>
            {withSuspense(<AuthorityPage />)}
          </RequireRole>
        ),
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
        path: 'access-requests',
        element: withSuspense(<AccessRequestsPage />),
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
