import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { monitoringClient } from '@/api/clients/monitoringClient/monitoringClient';
import { queryKeys } from '@/api/queryKeys/queryKeys';
import type { TimeRange } from '@/api/types/metrics/metrics';
import { appConfig } from '@/config/appConfig/appConfig';

export const useMonitoringOverview = (range: TimeRange) =>
  useQuery({
    queryKey: queryKeys.monitoringOverview(range),
    queryFn: () => monitoringClient.getOverview(range),
    refetchInterval: appConfig.dashboardRefetchIntervalMs,
    refetchIntervalInBackground: true,
    placeholderData: keepPreviousData,
  });
