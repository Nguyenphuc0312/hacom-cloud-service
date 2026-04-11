import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { currentAdminClient } from '@/api/clients';
import { getApiErrorCode, getApiErrorStatus, getErrorMessage } from '@/api/error';
import { queryKeys } from '@/api/queryKeys';
import { useAuthStore } from '@/store/authStore';

export const useCurrentUser = () => {
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);

  const meQuery = useQuery({
    queryKey: queryKeys.currentAdmin,
    queryFn: currentAdminClient.getCurrentAdmin,
    enabled: Boolean(accessToken),
    retry: (failureCount, error) => {
      const status = getApiErrorStatus(error);
      const code = getApiErrorCode(error);

      if (code === 'AUTH_UPSTREAM_UNREACHABLE') {
        return failureCount < 2;
      }

      return [502, 503, 504].includes(status ?? 0) && failureCount < 2;
    },
    retryDelay: (attempt) => Math.min(500 * attempt, 1500),
  });

  useEffect(() => {
    if (meQuery.data) {
      setUser(meQuery.data);
    }
  }, [meQuery.data, setUser]);

  const errorCode = getApiErrorCode(meQuery.error);
  const isAuthServiceUnavailable =
    errorCode === 'AUTH_UPSTREAM_UNREACHABLE' ||
    errorCode === 'AUTH_UPSTREAM_ENDPOINT_NOT_FOUND' ||
    [502, 503, 504].includes(getApiErrorStatus(meQuery.error) ?? 0);

  return {
    user: user ?? meQuery.data ?? null,
    isLoading: Boolean(accessToken) && meQuery.isLoading && !user,
    isRetryingCurrentUser: Boolean(accessToken) && meQuery.isFetching,
    isAuthServiceUnavailable,
    currentUserErrorMessage: meQuery.error
      ? getErrorMessage(meQuery.error, 'Admin auth service unavailable')
      : undefined,
    retryCurrentUser: () => meQuery.refetch(),
  };
};
