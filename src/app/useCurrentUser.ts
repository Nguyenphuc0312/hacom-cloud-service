import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { authClient } from '@/api/clients';
import { queryKeys } from '@/api/queryKeys';
import { useAuthStore } from '@/store/authStore';

export const useCurrentUser = () => {
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);

  const meQuery = useQuery({
    queryKey: queryKeys.me,
    queryFn: authClient.me,
    enabled: Boolean(accessToken),
    retry: false,
  });

  useEffect(() => {
    if (meQuery.data) {
      setUser(meQuery.data);
    }
  }, [meQuery.data, setUser]);

  return {
    user: user ?? meQuery.data ?? null,
    isLoading: Boolean(accessToken) && meQuery.isLoading && !user,
  };
};
