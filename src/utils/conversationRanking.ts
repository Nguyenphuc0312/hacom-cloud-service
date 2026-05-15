import type { Conversation, UserSummary } from "../types";

type UnknownRecord = Record<string, unknown>;

export interface ConversationRankContext {
  currentUserId?: string;
  currentUsername?: string;
  currentDisplayName?: string;
  activeConversationId?: string | null;
}

export interface ConversationRankBreakdown {
  bucket: number;
  score: number;
  mention: number;
  failed: number;
  draft: number;
  unread: number;
  active: number;
  recency: number;
  mutedPenalty: number;
}

const asRecord = (value: unknown): UnknownRecord | null =>
  value !== null && typeof value === "object"
    ? (value as UnknownRecord)
    : null;

const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const asBoolean = (value: unknown): boolean | null =>
  typeof value === "boolean" ? value : null;

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null;

const toTimestamp = (value: unknown): number => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" || typeof value === "number") {
    const timestamp = new Date(value).getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
  }
  return 0;
};

const normalizeMentionToken = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().replace(/\s+/g, "");
};

const getConversationExtendedRecord = (
  conversation: Conversation,
): UnknownRecord | null => asRecord(conversation);

export const hasConversationMention = (
  conversation: Conversation,
  currentUser?: Pick<UserSummary, "id" | "username" | "displayName"> | null,
): boolean => {
  if ((conversation.unreadCount || 0) <= 0) return false;
  if (!conversation.lastMessage) return false;
  if (currentUser && conversation.lastMessage.senderId === currentUser.id) {
    return false;
  }

  const record = getConversationExtendedRecord(conversation);
  const explicitMentionCount =
    asNumber(record?.mentionCount) ??
    asNumber(record?.mentionsCount) ??
    asNumber(record?.unreadMentionCount);
  if (explicitMentionCount !== null) {
    return explicitMentionCount > 0;
  }

  const explicitMention =
    asBoolean(record?.hasMention) ??
    asBoolean(record?.isMentioned) ??
    asBoolean(record?.mentioned);
  if (explicitMention !== null) {
    return explicitMention;
  }

  const content = conversation.lastMessage.content || "";
  if (!content) return false;
  if (/@(all|channel|here)\b/i.test(content)) return true;
  if (!currentUser) return false;

  const normalizedContent = content.toLowerCase().replace(/\s+/g, "");
  const usernameToken = normalizeMentionToken(currentUser.username);
  const displayNameToken = normalizeMentionToken(currentUser.displayName);

  return (
    Boolean(usernameToken) &&
      normalizedContent.includes(`@${usernameToken}`) ||
    Boolean(displayNameToken) &&
      normalizedContent.includes(`@${displayNameToken}`)
  );
};

const hasConversationDraft = (conversation: Conversation): boolean => {
  const record = getConversationExtendedRecord(conversation);
  const explicitDraft =
    asBoolean(record?.hasDraft) ??
    asBoolean(record?.isDraft) ??
    asBoolean(record?.draft);
  if (explicitDraft !== null) return explicitDraft;

  const draftText =
    asString(record?.draftText) ??
    asString(record?.draftContent) ??
    asString(record?.pendingDraft);
  return Boolean(draftText);
};

const hasConversationFailedSend = (conversation: Conversation): boolean => {
  const record = getConversationExtendedRecord(conversation);
  const explicitFailure =
    asBoolean(record?.hasFailedSend) ??
    asBoolean(record?.failedSend) ??
    asBoolean(record?.hasSendError);
  if (explicitFailure !== null) return explicitFailure;

  const failureCount =
    asNumber(record?.failedSendCount) ??
    asNumber(record?.failedMessageCount);
  if (failureCount !== null) {
    return failureCount > 0;
  }

  const lastMessageRecord =
    conversation.lastMessage &&
    typeof conversation.lastMessage === "object"
      ? (conversation.lastMessage as unknown as Record<string, unknown>)
      : null;
  const isDeleted = asBoolean(lastMessageRecord?.isDeleted);
  const lifecycleStatus = asString(lastMessageRecord?.lifecycleStatus);
  if (isDeleted || lifecycleStatus === "recalled" || lifecycleStatus === "deleted_admin") {
    return false;
  }

  const sendState =
    typeof lastMessageRecord?.sendState === "string"
      ? lastMessageRecord.sendState
      : null;
  const status =
    typeof lastMessageRecord?.status === "string"
      ? lastMessageRecord.status
      : null;

  return sendState === "failed" || status === "failed";
};

export const getConversationActivityTimestamp = (
  conversation: Conversation,
): number => {
  const record = getConversationExtendedRecord(conversation);
  const canonicalTimestamp =
    toTimestamp(record?.lastMessageSortAt) ||
    toTimestamp(conversation.lastMessageSortAt) ||
    toTimestamp(record?.lastMessageAt) ||
    toTimestamp(conversation.lastMessageAt) ||
    toTimestamp(conversation.lastMessage?.createdAt) ||
    toTimestamp(record?.lastActivityAt) ||
    toTimestamp(conversation.lastActivityAt);

  if (canonicalTimestamp > 0) {
    return canonicalTimestamp;
  }

  return toTimestamp(conversation.updatedAt);
};

export const getConversationSortIdentity = (
  conversation: Conversation,
): string => {
  const record = getConversationExtendedRecord(conversation);
  return (
    asString(record?.lastMessageId) ??
    asString(conversation.lastMessageId) ??
    asString(conversation.lastMessage?.id) ??
    conversation.id
  );
};

export const getConversationRankBreakdown = (
  conversation: Conversation,
  context: ConversationRankContext = {},
): ConversationRankBreakdown => {
  const currentUser = context.currentUserId
    ? {
        id: context.currentUserId,
        username: context.currentUsername || "",
        displayName: context.currentDisplayName || "",
      }
    : null;
  const mention = hasConversationMention(conversation, currentUser) ? 1 : 0;
  const failed = hasConversationFailedSend(conversation) ? 1 : 0;
  const draft = hasConversationDraft(conversation) ? 1 : 0;
  const unread = Math.max(0, conversation.unreadCount || 0);
  const active =
    context.activeConversationId &&
    context.activeConversationId === conversation.id
      ? 1
      : 0;
  const recency = getConversationActivityTimestamp(conversation);
  const mutedPenalty = conversation.isMuted ? 1 : 0;
  const bucket = 0;

  return {
    bucket,
    score: recency,
    mention,
    failed,
    draft,
    unread,
    active,
    recency,
    mutedPenalty,
  };
};

export const rankConversations = (
  conversations: Conversation[] | null | undefined,
  context: ConversationRankContext = {},
): Conversation[] => {
  void context;
  return sortConversationsByActivity(conversations);
};

export const sortConversationsByActivity = (
  conversations: Conversation[] | null | undefined,
): Conversation[] => {
  if (!Array.isArray(conversations)) return [];

  return [...conversations].sort(compareConversationsByActivity);
};

export const compareConversationsByActivity = (
  a: Conversation,
  b: Conversation,
): number => {
  const aActivity = getConversationActivityTimestamp(a);
  const bActivity = getConversationActivityTimestamp(b);

  if (aActivity !== bActivity) {
    return bActivity - aActivity;
  }

  const aLastMessageId = getConversationSortIdentity(a);
  const bLastMessageId = getConversationSortIdentity(b);
  if (aLastMessageId !== bLastMessageId) {
    return bLastMessageId.localeCompare(aLastMessageId);
  }

  return a.id.localeCompare(b.id);
};
