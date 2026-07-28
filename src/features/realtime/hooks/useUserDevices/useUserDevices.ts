import { useQuery } from '@tanstack/react-query';

import { sessionsClient } from '@/api/clients/sessionsClient/sessionsClient';
import { queryKeys } from '@/api/queryKeys/queryKeys';

const DEVICE_PAGE = { page: 1, limit: 10 };

/**
 * Devices registered to an account, from chat-auth-service.
 *
 * Fetched per user and only when asked for: presence carries no device data,
 * and the admin API exposes devices one user at a time, so loading them for a
 * whole table would be an N+1 per row.
 */
export const useUserDevices = (userId: string | undefined, enabled: boolean) =>
  useQuery({
    queryKey: queryKeys.userDevices(userId ?? '', DEVICE_PAGE),
    queryFn: () => sessionsClient.listDevicesByUserId(userId as string, DEVICE_PAGE),
    enabled: Boolean(userId) && enabled,
    staleTime: 60_000,
  });

export const useUserSessions = (userId: string | undefined, enabled: boolean) =>
  useQuery({
    queryKey: queryKeys.userSessions(userId ?? '', DEVICE_PAGE),
    queryFn: () => sessionsClient.listByUserId(userId as string, DEVICE_PAGE),
    enabled: Boolean(userId) && enabled,
    staleTime: 60_000,
  });
