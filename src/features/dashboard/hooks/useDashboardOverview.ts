import { keepPreviousData, useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';

import { accessClient, monitoringClient, serviceHealthClient, usersClient } from '@/api/clients';
import { queryKeys } from '@/api/queryKeys';
import type { TimeRange } from '@/api/types';
import { appConfig } from '@/config/appConfig';
import { deriveDashboardIncidents } from '../utils/dashboardView';

export const useDashboardOverview = (range: TimeRange) => {
  const [
    totalUsersQuery,
    activeUsersQuery,
    pendingUsersQuery,
    pendingAdminAccessQuery,
    monitoringQuery,
    serviceHealthQuery,
  ] = useQueries({
    queries: [
      {
        queryKey: queryKeys.usersList('dashboard-total-users'),
        queryFn: () => usersClient.list({ page: 1, limit: 1 }),
      },
      {
        queryKey: queryKeys.usersList('dashboard-active-users'),
        queryFn: () => usersClient.list({ page: 1, limit: 1, accountStatus: 'ACTIVE' }),
      },
      {
        queryKey: queryKeys.usersList('dashboard-pending-users'),
        queryFn: () =>
          usersClient.list({ page: 1, limit: 1, accountStatus: 'PENDING_VERIFICATION' }),
      },
      {
        queryKey: queryKeys.accessIpRequests('dashboard-pending'),
        queryFn: () =>
          accessClient.listRequests({ page: 1, limit: 1, status: 'pending' }),
      },
      {
        queryKey: queryKeys.monitoringOverview(range),
        queryFn: () => monitoringClient.getOverview(range),
        placeholderData: keepPreviousData,
        refetchInterval: appConfig.dashboardRefetchIntervalMs,
        refetchIntervalInBackground: true,
      },
      {
        queryKey: queryKeys.serviceHealth,
        queryFn: serviceHealthClient.getServiceHealth,
        placeholderData: keepPreviousData,
        refetchInterval: appConfig.dashboardRefetchIntervalMs,
        refetchIntervalInBackground: true,
      },
    ],
  });

  const incidents = useMemo(
    () =>
      deriveDashboardIncidents({
        overview: monitoringQuery.data,
        serviceHealth: serviceHealthQuery.data,
      }),
    [monitoringQuery.data, serviceHealthQuery.data],
  );

  return {
    totalUsersQuery,
    activeUsersQuery,
    pendingUsersQuery,
    pendingAdminAccessQuery,
    monitoringQuery,
    serviceHealthQuery,
    incidents,
  };
};
