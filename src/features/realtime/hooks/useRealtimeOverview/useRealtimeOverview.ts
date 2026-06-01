import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

import { realtimeClient } from '@/api/clients/realtimeClient/realtimeClient';
import { queryKeys } from '@/api/queryKeys/queryKeys';
import { appConfig } from '@/config/appConfig/appConfig';

export const useRealtimeOverview = () => {
  const [isPaused, setIsPaused] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const query = useQuery({
    queryKey: queryKeys.realtimeOverview,
    queryFn: realtimeClient.getOverview,
    refetchInterval: isPaused ? false : appConfig.dashboardRefetchIntervalMs,
    refetchIntervalInBackground: false,
    staleTime: 5000,
  });

  useEffect(() => {
    if (query.dataUpdatedAt) {
      setLastUpdated(new Date(query.dataUpdatedAt));
    }
  }, [query.dataUpdatedAt]);

  const togglePause = useCallback(() => {
    setIsPaused((prev) => !prev);
  }, []);

  const refresh = useCallback(() => {
    void query.refetch();
  }, [query]);

  return {
    ...query,
    isPaused,
    togglePause,
    refresh,
    lastUpdated,
  };
};
