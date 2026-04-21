import type {
  ConversationListQuery,
  ConversationMessage,
  ConversationMessagesQuery,
  ConversationSummary,
} from '@/api/types';

const now = Date.now();

let conversations: ConversationSummary[] = [
  {
    id: 'c-1001',
    participantName: 'Nguyễn Thu Hà',
    participantAvatar: 'TH',
    preview: 'Mình cần kiểm tra lại đơn bảo hành vì app báo pending quá lâu.',
    lastMessageAt: new Date(now - 1000 * 60 * 2).toISOString(),
    unreadCount: 2,
    status: 'open',
    presence: 'online',
  },
  {
    id: 'c-1002',
    participantName: 'Lê Minh Khoa',
    participantAvatar: 'MK',
    preview: 'JSON payload trả về thiếu trường status ở bước đồng bộ cuối.',
    lastMessageAt: new Date(now - 1000 * 60 * 18).toISOString(),
    unreadCount: 0,
    status: 'pending',
    presence: 'away',
  },
  {
    id: 'c-1003',
    participantName: 'Trần Gia Hân',
    participantAvatar: 'GH',
    preview: 'Đã nhận được hướng dẫn. Cảm ơn team.',
    lastMessageAt: new Date(now - 1000 * 60 * 60 * 4).toISOString(),
    unreadCount: 0,
    status: 'resolved',
    presence: 'offline',
  },
];

let messages: ConversationMessage[] = [
  {
    id: 'm-1001',
    conversationId: 'c-1001',
    authorType: 'customer',
    authorName: 'Nguyễn Thu Hà',
    body: 'Chào admin, mình cần kiểm tra lại đơn bảo hành vì app báo pending quá lâu.',
    kind: 'text',
    sentAt: new Date(now - 1000 * 60 * 14).toISOString(),
  },
  {
    id: 'm-1002',
    conversationId: 'c-1001',
    authorType: 'agent',
    authorName: 'Admin',
    body: 'Mình đang kiểm tra lại luồng xử lý. Bạn chờ mình khoảng vài phút.',
    kind: 'text',
    sentAt: new Date(now - 1000 * 60 * 11).toISOString(),
  },
  {
    id: 'm-1003',
    conversationId: 'c-1001',
    authorType: 'system',
    authorName: 'System',
    body: '{\n  "ticketId": "BH-2041",\n  "queue": "after_sales",\n  "status": "pending_review"\n}',
    kind: 'json',
    sentAt: new Date(now - 1000 * 60 * 9).toISOString(),
  },
  {
    id: 'm-1004',
    conversationId: 'c-1001',
    authorType: 'customer',
    authorName: 'Nguyễn Thu Hà',
    body: 'Mình đã chờ từ sáng nên muốn biết còn thiếu bước gì không.',
    kind: 'text',
    sentAt: new Date(now - 1000 * 60 * 2).toISOString(),
  },
  {
    id: 'm-2001',
    conversationId: 'c-1002',
    authorType: 'customer',
    authorName: 'Lê Minh Khoa',
    body: 'JSON payload trả về thiếu trường status ở bước đồng bộ cuối.',
    kind: 'text',
    sentAt: new Date(now - 1000 * 60 * 32).toISOString(),
  },
  {
    id: 'm-2002',
    conversationId: 'c-1002',
    authorType: 'customer',
    authorName: 'Lê Minh Khoa',
    body: "const response = {\n  id: 'sync-22',\n  payload: { ok: true }\n};",
    kind: 'code',
    sentAt: new Date(now - 1000 * 60 * 18).toISOString(),
  },
  {
    id: 'm-3001',
    conversationId: 'c-1003',
    authorType: 'agent',
    authorName: 'Admin',
    body: 'Mình đã cập nhật lại quyền truy cập. Bạn kiểm tra lại giúp mình.',
    kind: 'text',
    sentAt: new Date(now - 1000 * 60 * 60 * 5).toISOString(),
  },
  {
    id: 'm-3002',
    conversationId: 'c-1003',
    authorType: 'customer',
    authorName: 'Trần Gia Hân',
    body: 'Đã nhận được hướng dẫn. Cảm ơn team.',
    kind: 'text',
    sentAt: new Date(now - 1000 * 60 * 60 * 4).toISOString(),
  },
];

const sortConversations = (items: ConversationSummary[]) =>
  [...items].sort(
    (left, right) => new Date(right.lastMessageAt).getTime() - new Date(left.lastMessageAt).getTime(),
  );

const listMessagesInternal = (conversationId: string) =>
  messages
    .filter((entry) => entry.conversationId === conversationId)
    .sort((left, right) => new Date(left.sentAt).getTime() - new Date(right.sentAt).getTime());

const wait = async () => new Promise((resolve) => window.setTimeout(resolve, 120));

export const conversationsClient = {
  async list(params?: ConversationListQuery): Promise<ConversationSummary[]> {
    await wait();

    const keyword = params?.search?.trim().toLowerCase();
    const base = sortConversations(conversations);

    if (!keyword) {
      return base;
    }

    return base.filter((entry) =>
      `${entry.participantName} ${entry.preview}`.toLowerCase().includes(keyword),
    );
  },

  async getMessages(
    conversationId: string,
    params?: ConversationMessagesQuery,
  ): Promise<ConversationMessage[]> {
    await wait();
    void params;
    return listMessagesInternal(conversationId);
  },

  async sendMessage(conversationId: string, body: string): Promise<ConversationMessage> {
    await wait();

    const message: ConversationMessage = {
      id: `m-${Math.random().toString(36).slice(2, 10)}`,
      conversationId,
      authorType: 'agent',
      authorName: 'Admin',
      body,
      kind: 'text',
      sentAt: new Date().toISOString(),
    };

    messages = [...messages, message];
    conversations = conversations.map((conversation) =>
      conversation.id === conversationId
        ? {
            ...conversation,
            preview: body,
            lastMessageAt: message.sentAt,
          }
        : conversation,
    );

    return message;
  },

  async markRead(conversationId: string): Promise<void> {
    await wait();
    conversations = conversations.map((conversation) =>
      conversation.id === conversationId ? { ...conversation, unreadCount: 0 } : conversation,
    );
  },
};
