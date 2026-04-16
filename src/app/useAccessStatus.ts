import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { accessClient } from '@/api/clients';
import { getApiErrorCode, getApiErrorStatus, getErrorMessage } from '@/api/error';
import { queryKeys } from '@/api/queryKeys';
import { useAuthStore } from '@/store/authStore';

export const useAccessStatus = () => {
  const accessToken = useAuthStore((state) => state.accessToken);
  const access = useAuthStore((state) => state.access);
  const setAccess = useAuthStore((state) => state.setAccess);
  const setAccessBootstrapStatus = useAuthStore((state) => state.setAccessBootstrapStatus);

  const query = useQuery({
    queryKey: queryKeys.accessStatus,
    queryFn: accessClient.getCurrentStatus,
    enabled: Boolean(accessToken),
    retry: (failureCount, error) => {
      const status = getApiErrorStatus(error);
      const code = getApiErrorCode(error);
      if (code === 'CLIENT_IP_UNRESOLVED') {
        return failureCount < 1;
      }
      return [502, 503, 504].includes(status ?? 0) && failureCount < 2;
    },
    retryDelay: (attempt) => Math.min(500 * attempt, 1500),
  });

  useEffect(() => {
    if (!accessToken) {
      setAccess(null);
      setAccessBootstrapStatus('unknown');
      return;
    }

    if (query.isLoading || query.isFetching) {
      setAccessBootstrapStatus('loading');
    }
  }, [accessToken, query.isFetching, query.isLoading, setAccess, setAccessBootstrapStatus]);

  useEffect(() => {
    if (query.data) {
      setAccess(query.data);
    }
  }, [query.data, setAccess]);

  return {
    access: access ?? query.data ?? null,
    isLoading: Boolean(accessToken) && (query.isLoading || query.isFetching) && !access,
    errorMessage: query.error ? getErrorMessage(query.error, 'Unable to resolve access status') : undefined,
    refresh: () => query.refetch(),
  };
};
