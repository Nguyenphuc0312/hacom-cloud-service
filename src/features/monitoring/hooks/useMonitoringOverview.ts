import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { monitoringClient } from '@/api/clients/monitoringClient';
import { queryKeys } from '@/api/queryKeys';
import type { TimeRange } from '@/api/types';

export const useMonitoringOverview = (range: TimeRange) =>
  useQuery({
    queryKey: queryKeys.monitoringOverview(range),
    queryFn: () => monitoringClient.getOverview(range),
    refetchInterval: 15_000,
    refetchIntervalInBackground: true,
    placeholderData: keepPreviousData,
  });
