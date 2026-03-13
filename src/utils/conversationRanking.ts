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
  return failureCount !== null ? failureCount > 0 : false;
};

const getConversationActivityTimestamp = (conversation: Conversation): number => {
  const record = getConversationExtendedRecord(conversation);
  return Math.max(
    toTimestamp(conversation.updatedAt),
    toTimestamp(conversation.lastMessage?.createdAt),
    toTimestamp(record?.lastMessageAt),
    toTimestamp(record?.draftUpdatedAt),
  );
};

const getUnreadScore = (count: number): number => {
  if (count <= 0) return 0;
  return Math.round(Math.log2(count + 1) * 20);
};

const getRecencyScore = (activityTimestamp: number): number => {
  if (activityTimestamp <= 0) return 0;
  const ageMinutes = Math.max(
    0,
    (Date.now() - activityTimestamp) / (60 * 1000),
  );
  if (ageMinutes <= 5) return 60;
  if (ageMinutes <= 30) return 48;
  if (ageMinutes <= 120) return 34;
  if (ageMinutes <= 1440) return 18;
  if (ageMinutes <= 10080) return 8;
  return 0;
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
  const mention = hasConversationMention(conversation, currentUser) ? 100 : 0;
  const failed = hasConversationFailedSend(conversation) ? 70 : 0;
  const draft = hasConversationDraft(conversation) ? 40 : 0;
  const unread = getUnreadScore(conversation.unreadCount || 0);
  const active =
    context.activeConversationId &&
    context.activeConversationId === conversation.id
      ? 25
      : 0;
  const recency = getRecencyScore(getConversationActivityTimestamp(conversation));
  const mutedPenalty = conversation.isMuted ? 35 : 0;
  const bucket = conversation.isArchived ? 2 : conversation.isPinned ? 0 : 1;

  return {
    bucket,
    score: mention + failed + draft + unread + active + recency - mutedPenalty,
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
  if (!Array.isArray(conversations)) return [];

  return [...conversations].sort((a, b) => {
    const aRank = getConversationRankBreakdown(a, context);
    const bRank = getConversationRankBreakdown(b, context);

    if (aRank.bucket !== bRank.bucket) {
      return aRank.bucket - bRank.bucket;
    }
    if (aRank.score !== bRank.score) {
      return bRank.score - aRank.score;
    }

    const aActivity = getConversationActivityTimestamp(a);
    const bActivity = getConversationActivityTimestamp(b);
    if (aActivity !== bActivity) {
      return bActivity - aActivity;
    }

    return a.id.localeCompare(b.id);
  });
};
