import apiClient from '../lib/axios';

const EVENT_TYPE = 'chat.activity.occurred.v1';

export const reportActivity = async (eventId: string, occurredAt: Date): Promise<void> => {
  await apiClient.post('/activity/events', { eventId, eventType: EVENT_TYPE, occurredAt: occurredAt.toISOString() });
};
