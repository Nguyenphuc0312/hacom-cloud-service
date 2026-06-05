/**
 * HR Notification API — in-app notifications served by hr-api-service.
 * Used to surface calendar meeting invites / responses inside chat-web-client.
 * The calendar/notification feature is OPTIONAL: any failure here must degrade
 * silently (caller treats errors as "no notifications"), never log the user out.
 */

import { hrApiClient } from "./hrApi";

export interface HrAppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  actorName: string | null;
  entityType: string | null;
  entityId: string | null;
  payload: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export interface ListHrNotificationsParams {
  page?: number;
  pageSize?: number;
  unreadOnly?: boolean;
}

export const hrNotificationApi = {
  list: async (
    params: ListHrNotificationsParams = {},
  ): Promise<HrAppNotification[]> => {
    const sp = new URLSearchParams();
    sp.append("page", String(params.page ?? 1));
    sp.append("pageSize", String(params.pageSize ?? 20));
    if (params.unreadOnly) sp.append("unreadOnly", "true");
    const res = await hrApiClient.get(`/notifications?${sp.toString()}`);
    // Gateway normalizes list → { success, data: { items, pagination } }
    const data = (res.data as { data?: { items?: HrAppNotification[] } })?.data;
    return Array.isArray(data?.items) ? data!.items! : [];
  },

  unreadCount: async (): Promise<number> => {
    const res = await hrApiClient.get(`/notifications/unread-count`);
    const data = (res.data as { data?: { count?: number } })?.data;
    return typeof data?.count === "number" ? data.count : 0;
  },

  markRead: async (id: string): Promise<void> => {
    await hrApiClient.patch(`/notifications/${id}/read`);
  },

  markAllRead: async (): Promise<void> => {
    await hrApiClient.patch(`/notifications/read-all`);
  },
};

export default hrNotificationApi;
