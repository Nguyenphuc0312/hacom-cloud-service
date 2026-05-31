import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useCallback } from 'react';
import { monitoringClient } from '@/api/clients/monitoringClient/monitoringClient';
import { queryKeys } from '@/api/queryKeys/queryKeys';
import type { TimeRange } from '@/api/types/metrics/metrics';
import { appConfig } from '@/config/appConfig/appConfig';

const MIN_RETRY_DELAY_MS = 15_000;
const MAX_RETRY_DELAY_MS = 120_000;
const MAX_RETRIES = 5;

export const useMonitoringOverview = (range: TimeRange) => {
  const [effectiveInterval, setEffectiveInterval] = useState(
    appConfig.pollingConfig.default,
  );
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.monitoringOverview(range),
    queryFn: () => monitoringClient.getOverview(range),
    refetchInterval: effectiveInterval,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
    retry: (failureCount, error) => {
      if (failureCount >= MAX_RETRIES) {
        return false;
      }

      const err = error as { response?: { status?: number } } | null;
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        return false;
      }

      return true;
    },
    retryDelay: (attemptIndex) => {
      const delay = Math.min(
        MIN_RETRY_DELAY_MS * Math.pow(2, attemptIndex),
        MAX_RETRY_DELAY_MS,
      );
      return delay;
    },
  });

  useEffect(() => {
    if (query.isSuccess && !query.isError) {
      setEffectiveInterval(appConfig.pollingConfig.default);
    }
  }, [query.isSuccess, query.isError]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setEffectiveInterval(appConfig.pollingConfig.background);
      } else {
        if (query.isStale) {
          void query.refetch();
        }
        setEffectiveInterval(appConfig.pollingConfig.default);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [query]);

  const invalidateAndRefetch = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.monitoringOverview(range),
    });
  }, [queryClient, range]);

  return {
    ...query,
    refetch: invalidateAndRefetch,
  };
};
