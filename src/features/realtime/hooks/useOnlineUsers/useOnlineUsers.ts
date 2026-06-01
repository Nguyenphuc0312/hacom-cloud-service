import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { realtimeClient } from '@/api/clients/realtimeClient/realtimeClient';
import { queryKeys } from '@/api/queryKeys/queryKeys';

export interface OnlineUsersFilters {
  page?: number;
  pageSize?: number;
  search?: string;
  departmentId?: string;
}

export const useOnlineUsers = (filters: OnlineUsersFilters = {}) => {
  const { page = 1, pageSize = 50, search, departmentId } = filters;

  const query = useQuery({
    queryKey: queryKeys.realtimeOnlineUsers({ page, pageSize, search, departmentId }),
    queryFn: () =>
      realtimeClient.getOnlineUsers(page, pageSize, search, departmentId),
    placeholderData: keepPreviousData,
    staleTime: 10000,
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
  });

  return query;
};
