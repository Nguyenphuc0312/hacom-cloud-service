import { adminAxiosInstance } from '@/api/axios';
import { unwrapApiEnvelope } from '@/api/envelope';
import type {
  ConversationListQuery,
  ConversationMessage,
  ConversationMessagesQuery,
  ConversationSummary,
} from '@/api/types';

interface ConversationListPayload {
  items?: ConversationSummary[];
  conversations?: ConversationSummary[];
}

interface ConversationMessagesPayload {
  items?: ConversationMessage[];
  messages?: ConversationMessage[];
}

const readConversationItems = (payload: ConversationListPayload | ConversationSummary[]) => {
  if (Array.isArray(payload)) {
    return payload;
  }

  return payload.items ?? payload.conversations ?? [];
};

const readMessageItems = (payload: ConversationMessagesPayload | ConversationMessage[]) => {
  if (Array.isArray(payload)) {
    return payload;
  }

  return payload.items ?? payload.messages ?? [];
};

export const conversationsClient = {
  async list(params?: ConversationListQuery): Promise<ConversationSummary[]> {
    const response = await adminAxiosInstance.get('/conversations', { params });
    return readConversationItems(unwrapApiEnvelope<ConversationListPayload | ConversationSummary[]>(response));
  },

  async getMessages(
    conversationId: string,
    params?: ConversationMessagesQuery,
  ): Promise<ConversationMessage[]> {
    const response = await adminAxiosInstance.get(`/conversations/${conversationId}/messages`, {
      params,
    });
    return readMessageItems(
      unwrapApiEnvelope<ConversationMessagesPayload | ConversationMessage[]>(response),
    );
  },

  async markRead(conversationId: string): Promise<void> {
    const response = await adminAxiosInstance.post(`/conversations/${conversationId}/read`, {});
    unwrapApiEnvelope<unknown>(response);
  },
};
