import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { realtimeClient } from '@/api/clients/realtimeClient/realtimeClient';
import { queryKeys } from '@/api/queryKeys/queryKeys';

export interface OnlineUsersFilters {
  page?: number;
  pageSize?: number;
  search?: string;
  departmentId?: string;
  state?: string;
  /** Operators can pause polling while reading a long list. */
  autoRefresh?: boolean;
}

const REFETCH_INTERVAL_MS = 15000;

export const useOnlineUsers = (filters: OnlineUsersFilters = {}) => {
  const { page = 1, pageSize = 50, search, departmentId, state, autoRefresh = true } = filters;

  const query = useQuery({
    queryKey: queryKeys.realtimeOnlineUsers({ page, pageSize, search, departmentId, state }),
    queryFn: () => realtimeClient.getOnlineUsers({ page, pageSize, search, departmentId, state }),
    placeholderData: keepPreviousData,
    staleTime: 10000,
    refetchInterval: autoRefresh ? REFETCH_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
  });

  return query;
};
