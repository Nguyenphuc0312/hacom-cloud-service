import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';

import { monitoringClient, serviceHealthClient, usersClient } from '@/api/clients';
import { alertsClient } from '@/api/clients/alertsClient';
import { queryKeys } from '@/api/queryKeys';
import type { TimeRange } from '@/api/types';
import { appConfig } from '@/config/appConfig';

export const useDashboardOverview = (range: TimeRange) => {
  const [
    totalUsersQuery,
    activeUsersQuery,
    pendingUsersQuery,
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

  const incidentsQuery = useQuery({
    queryKey: ['alerts-incidents-firing'],
    queryFn: () => alertsClient.getIncidents({ status: 'firing' }),
    retry: 0,
    placeholderData: keepPreviousData,
    refetchInterval: appConfig.dashboardRefetchIntervalMs,
    refetchIntervalInBackground: true,
  });

  return {
    totalUsersQuery,
    activeUsersQuery,
    pendingUsersQuery,
    monitoringQuery,
    serviceHealthQuery,
    incidentsQuery,
  };
};
