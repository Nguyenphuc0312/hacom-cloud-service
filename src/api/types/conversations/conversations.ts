export type ConversationStatus = 'open' | 'pending' | 'resolved';
export type ConversationParticipantPresence = 'online' | 'offline' | 'away';
export type ConversationMessageKind = 'text' | 'json' | 'code';
export type ConversationAuthorType = 'customer' | 'agent' | 'system';

export interface ConversationSummary {
  id: string;
  participantName: string;
  participantAvatar: string;
  preview: string;
  lastMessageAt: string;
  unreadCount: number;
  status: ConversationStatus;
  presence: ConversationParticipantPresence;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  authorType: ConversationAuthorType;
  authorName: string;
  body: string;
  kind: ConversationMessageKind;
  sentAt: string;
}

export interface ConversationListQuery {
  search?: string;
}

export interface ConversationMessagesQuery {
  limit?: number;
}
