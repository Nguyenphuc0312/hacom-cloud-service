import { MessageStatus } from "../../../types";
import type { Attachment, Message, Reaction } from "../../../types";
import {
  findMessageIdentityIndex,
  getStableMessageId,
  isTempMessageId,
  messagesShareIdentity,
} from "./messageIdentity";
import {
  compareMessages,
  findSortedInsertIndex,
  sortMessagesByCanonicalOrder,
} from "./messageOrdering";
import {
  normalizeMessageForReduxCache,
  normalizeMessagesForReduxCache,
} from "./serializableMessage";

export type MessageMergeMode = "replace" | "prepend" | "append" | "upsert";

export interface ConversationMessagesCache {
  conversationId: string;
  messages: Message[];
  messageById: Record<string, Message>;
  messageIds: string[];
  oldestLoadedMessageId: string | null;
  newestLoadedMessageId: string | null;
  oldestLoadedSeq: number | null;
  newestLoadedSeq: number | null;
  hasMoreOlder: boolean;
  hasMoreNewer: boolean;
}

export interface IncomingMessagesPage {
  conversationId: string;
  messages: Message[];
  hasMoreOlder?: boolean;
  hasMoreNewer?: boolean;
}

export function getMessageSeq(message: unknown): number | null {
  if (!message || typeof message !== "object") {
    return null;
  }

  const record = message as Record<string, unknown>;
  const raw = record.serverSeq ?? record.messageSeq ?? record.seq ?? null;

  if (raw === null || raw === undefined || raw === "") {
    return null;
  }

  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

const isLocalPendingMessage = (message: Message): boolean =>
  message.transportStatus === "optimistic" ||
  message.sendState === "sending" ||
  message.sendState === "queued" ||
  message.sendState === "retrying" ||
  message.sendState === "failed";

const MAX_MESSAGES_PER_CONVERSATION_CACHE = 600;

const trimMessagesForBoundedCache = (messages: Message[]): Message[] => {
  if (messages.length <= MAX_MESSAGES_PER_CONVERSATION_CACHE) {
    return messages;
  }

  const protectedMessages = messages.filter(isLocalPendingMessage);
  const protectedKeys = new Set(protectedMessages.map(getStableMessageId));
  const normalMessages = messages.filter(
    (message) => !protectedKeys.has(getStableMessageId(message)),
  );
  const retainedTail = normalMessages.slice(
    Math.max(
      0,
      normalMessages.length -
        Math.max(
          MAX_MESSAGES_PER_CONVERSATION_CACHE - protectedMessages.length,
          0,
        ),
    ),
  );

  return sortMessagesByCanonicalOrder([...protectedMessages, ...retainedTail]);
};

const indexMessagesById = (messages: readonly Message[]) =>
  messages.reduce<Record<string, Message>>((accumulator, message) => {
    accumulator[getStableMessageId(message)] = message;
    accumulator[message.id] = message;
    return accumulator;
  }, {});

/**
 * Reply preview của tin ảnh/video/file thường thiếu `attachments` (BE chưa
 * populate vào `replyToMessage`, hoặc ack ghi đè mất snapshot optimistic). Tin
 * gốc lại đang nằm sẵn trong cache timeline với đầy đủ `attachments[].id` →
 * lấy lại từ đó để reply preview có thể mint signed thumbnail như timeline.
 * Trả về `true` nếu có thay đổi (caller cần build lại index).
 */
const hydrateReplyAttachments = (
  messages: Message[],
  lookup: Record<string, Message>,
): boolean => {
  let changed = false;
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    const reply = message.replyToMessage;
    if (!reply?.id) continue;

    const replyAttachments = (
      reply as Message["replyToMessage"] & { attachments?: Attachment[] }
    ).attachments;
    if (replyAttachments && replyAttachments.length > 0) continue;

    const targetAttachments = lookup[reply.id]?.attachments;
    if (targetAttachments && targetAttachments.length > 0) {
      messages[index] = {
        ...message,
        replyToMessage: {
          ...reply,
          attachments: targetAttachments as unknown as Attachment[],
        } as Message["replyToMessage"],
      };
      changed = true;
    }
  }
  return changed;
};

export const refreshCacheIndex = (cache: ConversationMessagesCache): void => {
  let byId = indexMessagesById(cache.messages);
  if (hydrateReplyAttachments(cache.messages, byId)) {
    byId = indexMessagesById(cache.messages);
  }

  const oldest = cache.messages[0] ?? null;
  const newest = cache.messages[cache.messages.length - 1] ?? null;

  cache.messageById = byId;
  cache.messageIds = cache.messages.map(getStableMessageId);
  cache.oldestLoadedMessageId = oldest?.id ?? null;
  cache.newestLoadedMessageId = newest?.id ?? null;
  cache.oldestLoadedSeq = oldest ? getMessageSeq(oldest) : null;
  cache.newestLoadedSeq = newest ? getMessageSeq(newest) : null;
};

export const buildConversationMessagesCache = (
  conversationId: string,
  messages: readonly Message[],
  options?: {
    hasMoreOlder?: boolean;
    hasMoreNewer?: boolean;
  },
): ConversationMessagesCache => {
  const orderedMessages = sortMessagesByCanonicalOrder(
    normalizeMessagesForReduxCache(messages),
  );
  const boundedMessages = trimMessagesForBoundedCache(orderedMessages);
  let byId = indexMessagesById(boundedMessages);
  if (hydrateReplyAttachments(boundedMessages, byId)) {
    byId = indexMessagesById(boundedMessages);
  }
  const oldest = boundedMessages[0] ?? null;
  const newest = boundedMessages[boundedMessages.length - 1] ?? null;

  return {
    conversationId,
    messages: boundedMessages,
    messageById: byId,
    messageIds: boundedMessages.map(getStableMessageId),
    oldestLoadedMessageId: oldest?.id ?? null,
    newestLoadedMessageId: newest?.id ?? null,
    oldestLoadedSeq: oldest ? getMessageSeq(oldest) : null,
    newestLoadedSeq: newest ? getMessageSeq(newest) : null,
    hasMoreOlder: options?.hasMoreOlder ?? false,
    hasMoreNewer: options?.hasMoreNewer ?? false,
  };
};

export const mergeMessageRecords = (
  current: Message,
  incoming: Message,
): Message => {
  const merged: Message = {
    ...current,
    ...incoming,
    id:
      isTempMessageId(current.id) && !isTempMessageId(incoming.id)
        ? incoming.id
        : !isTempMessageId(current.id) && isTempMessageId(incoming.id)
          ? current.id
          : incoming.id || current.id,
    localId:
      incoming.localId ||
      current.localId ||
      (isTempMessageId(current.id)
        ? current.id
        : isTempMessageId(incoming.id)
          ? incoming.id
          : undefined),
    clientMessageId:
      incoming.clientMessageId ||
      current.clientMessageId ||
      incoming.stableId ||
      current.stableId ||
      incoming.localId ||
      current.localId,
    stableId:
      current.stableId ||
      incoming.stableId ||
      incoming.clientMessageId ||
      current.clientMessageId ||
      incoming.localId ||
      current.localId ||
      incoming.id ||
      current.id,
    localOrder: incoming.localOrder ?? current.localOrder,
    // Preserve failed state only if message is not deleted
    // Deleted messages should not show as "failed"
    sendState:
      (incoming.isDeleted || incoming.lifecycleStatus === "recalled" || incoming.lifecycleStatus === "deleted_admin")
        ? "sent"
        : incoming.sendState === "failed"
          ? "failed"
          : incoming.status === MessageStatus.SENT ||
              incoming.status === MessageStatus.DELIVERED ||
              incoming.status === MessageStatus.READ ||
              !isTempMessageId(incoming.id)
            ? "sent"
            : (incoming.sendState ?? current.sendState),
  };

  if (merged.sendState === "sent") {
    merged.queuedReason = undefined;
    merged.failureReason = undefined;
    merged.errorCode = undefined;
    merged.errorMessage = undefined;
  }

  // Clear failure fields when message is deleted/recalled
  if (merged.isDeleted || merged.lifecycleStatus === "recalled" || merged.lifecycleStatus === "deleted_admin") {
    merged.queuedReason = undefined;
    merged.failureReason = undefined;
    merged.errorCode = undefined;
    merged.errorMessage = undefined;
  }

  // Preserve reply preview when server-acked event tạm thời thiếu snapshot
  // — KHÔNG để optimistic quote block biến mất sau ack.
  if (!merged.replyToMessage && current.replyToMessage) {
    merged.replyToMessage = current.replyToMessage;
  }
  if (!merged.replyTo && current.replyTo) {
    merged.replyTo = current.replyTo;
  }

  return normalizeMessageForReduxCache(merged);
};

export const mergeMessageLists = (
  current: readonly Message[],
  incoming: readonly Message[],
): Message[] => {
  const merged: Message[] = [...current];

  for (const message of incoming) {
    const existingIndex = findMessageIdentityIndex(merged, message);
    if (existingIndex < 0) {
      merged.push(message);
      continue;
    }

    merged[existingIndex] = mergeMessageRecords(merged[existingIndex], message);
  }

  return sortMessagesByCanonicalOrder(merged);
};

export const mergeIncomingMessagesPage = (
  current: ConversationMessagesCache | undefined,
  incoming: IncomingMessagesPage,
  mode: MessageMergeMode,
): ConversationMessagesCache => {
  if (!current) {
    return buildConversationMessagesCache(
      incoming.conversationId,
      incoming.messages,
      {
        hasMoreOlder: incoming.hasMoreOlder,
        hasMoreNewer: incoming.hasMoreNewer,
      },
    );
  }

  if (mode === "replace") {
    const incomingMessages = normalizeMessagesForReduxCache(incoming.messages);
    const incomingNewestSeq = incomingMessages.reduce<number | null>(
      (latest, message) => {
        const seq = getMessageSeq(message);
        if (seq === null) return latest;
        return latest === null ? seq : Math.max(latest, seq);
      },
      null,
    );
    const localPendingMessages = current.messages.filter(isLocalPendingMessage);
    const liveTailMessages =
      incomingNewestSeq === null
        ? []
        : current.messages.filter((message) => {
            const seq = getMessageSeq(message);
            return (
              !isLocalPendingMessage(message) &&
              seq !== null &&
              seq > incomingNewestSeq
            );
          });
    return buildConversationMessagesCache(
      incoming.conversationId,
      mergeMessageLists(incomingMessages, [
        ...localPendingMessages,
        ...liveTailMessages,
      ]),
      {
        hasMoreOlder: incoming.hasMoreOlder,
        hasMoreNewer: incoming.hasMoreNewer,
      },
    );
  }

  const mergedMessages = mergeMessageLists(current.messages, incoming.messages);
  const next = buildConversationMessagesCache(
    incoming.conversationId,
    mergedMessages,
    {
      hasMoreOlder: incoming.hasMoreOlder ?? current.hasMoreOlder,
      hasMoreNewer: incoming.hasMoreNewer ?? current.hasMoreNewer,
    },
  );

  return next;
};

export const upsertMessageInCache = (
  cache: ConversationMessagesCache,
  incoming: Message,
): void => {
  const normalizedIncoming = normalizeMessageForReduxCache(incoming);
  const existingIndex = findMessageIdentityIndex(
    cache.messages,
    normalizedIncoming,
  );

  if (existingIndex >= 0) {
    const merged = mergeMessageRecords(
      cache.messages[existingIndex],
      normalizedIncoming,
    );
    const prev = existingIndex > 0 ? cache.messages[existingIndex - 1] : null;
    const next =
      existingIndex + 1 < cache.messages.length
        ? cache.messages[existingIndex + 1]
        : null;
    const shouldReposition =
      (prev && compareMessages(prev, merged) > 0) ||
      (next && compareMessages(merged, next) > 0);

    if (shouldReposition) {
      cache.messages.splice(existingIndex, 1);
      cache.messages.splice(
        findSortedInsertIndex(cache.messages, merged),
        0,
        merged,
      );
    } else {
      cache.messages[existingIndex] = merged;
    }
  } else {
    cache.messages.splice(
      findSortedInsertIndex(cache.messages, normalizedIncoming),
      0,
      normalizedIncoming,
    );
  }

  refreshCacheIndex(cache);
};

export const patchMessageInCache = (
  cache: ConversationMessagesCache,
  messageId: string,
  patch: Partial<Message>,
): void => {
  const matchingIndex = findMessageIdentityIndex(cache.messages, {
    id: messageId,
    localId: messageId,
    stableId: messageId,
    clientMessageId: messageId,
  });

  if (matchingIndex < 0) return;

  const current = cache.messages[matchingIndex];
  upsertMessageInCache(cache, { ...current, ...patch });
};

export const removeMessageFromCache = (
  cache: ConversationMessagesCache,
  messageId: string,
): void => {
  const matchingIndex = findMessageIdentityIndex(cache.messages, {
    id: messageId,
    localId: messageId,
    stableId: messageId,
    clientMessageId: messageId,
  });

  if (matchingIndex < 0) return;

  cache.messages.splice(matchingIndex, 1);
  refreshCacheIndex(cache);
};

export const patchReactionSummary = (
  message: Message,
  emoji: string,
  userId: string | undefined,
  action: "add" | "remove",
): Reaction[] => {
  const currentReactions = message.reactions ?? [];
  if (!userId) {
    return currentReactions;
  }

  const existingReaction = currentReactions.find(
    (reaction) => reaction.emoji === emoji,
  );
  const otherReactions = currentReactions.filter(
    (reaction) => reaction.emoji !== emoji,
  );

  if (action === "remove") {
    if (!existingReaction) {
      return currentReactions;
    }

    const nextUserIds = existingReaction.userIds.filter((id) => id !== userId);
    const nextCount = Math.max(0, existingReaction.count - 1);
    return nextCount > 0 || nextUserIds.length > 0
      ? [
          ...otherReactions,
          {
            ...existingReaction,
            userIds: nextUserIds,
            count: Math.max(nextCount, nextUserIds.length),
          },
        ]
      : otherReactions;
  }

  if (existingReaction?.userIds.includes(userId)) {
    return currentReactions;
  }

  return [
    ...otherReactions,
    {
      emoji,
      userIds: [...(existingReaction?.userIds ?? []), userId],
      count: (existingReaction?.count ?? 0) + 1,
    },
  ];
};

/**
 * Apply a reaction change to the matching message WITHOUT rebuilding the cache
 * index. Returns true when a message object was actually replaced. Use this
 * inside a batched draft mutation, then call {@link refreshCacheIndex} once.
 *
 * A reaction never changes message ordering (seq/createdAt are untouched), so
 * we mutate in place and skip the reposition logic in upsertMessageInCache.
 */
export const applyReactionMutation = (
  cache: ConversationMessagesCache,
  input: {
    messageId: string;
    emoji: string;
    userId?: string;
  },
  action: "add" | "remove",
): boolean => {
  const index = cache.messages.findIndex((message) =>
    [
      message.id,
      message.localId,
      message.stableId,
      message.clientMessageId,
    ].some((value) => value === input.messageId),
  );

  if (index < 0) return false;

  const current = cache.messages[index];
  const reactions = patchReactionSummary(
    current,
    input.emoji,
    input.userId,
    action,
  );
  // patchReactionSummary returns the same reference for no-op events
  // (duplicate add / remove of a non-existent reaction) → skip churn.
  if (reactions === current.reactions) return false;

  cache.messages[index] = mergeMessageRecords(current, {
    ...current,
    reactions,
  });
  return true;
};

export const patchMessageReactionInCache = (
  cache: ConversationMessagesCache,
  input: {
    messageId: string;
    emoji: string;
    userId?: string;
  },
  action: "add" | "remove",
): boolean => {
  const changed = applyReactionMutation(cache, input, action);
  if (changed) {
    refreshCacheIndex(cache);
  }
  return changed;
};

/**
 * Mark the current user's own messages READ up to the read cursor WITHOUT
 * rebuilding the cache index. Returns true when at least one message changed.
 *
 * Previous implementation called patchMessageInCache() per matching message,
 * and each call rebuilt the entire messageById/messageIds index → O(n²) for a
 * cursor that advances over many unread messages. This version walks the list
 * exactly once and mutates in place; callers (or the batch flush) rebuild the
 * index a single time via {@link refreshCacheIndex}. Read state never changes
 * ordering, so no reposition is needed.
 */
export const applyReadCursorMutations = (
  cache: ConversationMessagesCache,
  input: {
    lastReadMessageId?: string;
    lastReadSeq?: number;
    currentUserId?: string;
    readerId?: string;
  },
): boolean => {
  if (!input.currentUserId) return false;
  if (input.readerId && input.readerId === input.currentUserId) return false;

  const boundaryIndex = input.lastReadMessageId
    ? findMessageIdentityIndex(cache.messages, {
        id: input.lastReadMessageId,
        localId: input.lastReadMessageId,
        stableId: input.lastReadMessageId,
        clientMessageId: input.lastReadMessageId,
      })
    : -1;
  const readAt = new Date().toISOString() as unknown as Date;
  let changed = false;

  for (let index = 0; index < cache.messages.length; index += 1) {
    const message = cache.messages[index];
    if (message.senderId !== input.currentUserId) continue;
    if (message.status === MessageStatus.READ) continue;

    const messageRecord = message as {
      messageSeq?: unknown;
      serverSeq?: unknown;
    };
    const messageSeq =
      typeof messageRecord.messageSeq === "number" &&
      Number.isFinite(messageRecord.messageSeq)
        ? messageRecord.messageSeq
        : typeof messageRecord.serverSeq === "number" &&
            Number.isFinite(messageRecord.serverSeq)
          ? messageRecord.serverSeq
          : null;
    const withinSeqBoundary =
      typeof input.lastReadSeq === "number" &&
      Number.isFinite(input.lastReadSeq) &&
      messageSeq !== null &&
      messageSeq <= input.lastReadSeq;

    const shouldPatch =
      boundaryIndex < 0
        ? withinSeqBoundary ||
          (input.lastReadMessageId
            ? messagesShareIdentity(message, {
                id: input.lastReadMessageId,
                localId: input.lastReadMessageId,
                stableId: input.lastReadMessageId,
                clientMessageId: input.lastReadMessageId,
              })
            : false)
        : withinSeqBoundary || index <= boundaryIndex;

    if (!shouldPatch) continue;

    cache.messages[index] = mergeMessageRecords(message, {
      ...message,
      status: MessageStatus.READ,
      readAt,
    });
    changed = true;
  }

  return changed;
};

export const patchReadCursorInCache = (
  cache: ConversationMessagesCache,
  input: {
    lastReadMessageId?: string;
    lastReadSeq?: number;
    currentUserId?: string;
    readerId?: string;
  },
): boolean => {
  const changed = applyReadCursorMutations(cache, input);
  if (changed) {
    refreshCacheIndex(cache);
  }
  return changed;
};

/**
 * Apply a delivered receipt to the matching own-message WITHOUT rebuilding the
 * cache index. Returns true when a message object was replaced. Delivered state
 * never changes ordering, so we mutate in place. Callers refresh the index once.
 */
export const applyDeliveredReceiptMutation = (
  cache: ConversationMessagesCache,
  input: {
    messageId: string;
    messageSeq?: number;
    currentUserId?: string;
    deliveredAt?: string;
  },
): boolean => {
  if (!input.currentUserId) return false;

  let index = findMessageIdentityIndex(cache.messages, {
    id: input.messageId,
    localId: input.messageId,
    stableId: input.messageId,
    clientMessageId: input.messageId,
  });
  if (index < 0) {
    index = cache.messages.findIndex((candidate) => {
      const candidateRecord = candidate as unknown as {
        messageSeq?: number;
      };
      const candidateSeq =
        typeof candidateRecord.messageSeq === "number" &&
        Number.isFinite(candidateRecord.messageSeq)
          ? candidateRecord.messageSeq
          : typeof candidate.serverSeq === "number" &&
              Number.isFinite(candidate.serverSeq)
            ? candidate.serverSeq
            : null;
      return (
        typeof input.messageSeq === "number" &&
        candidateSeq === input.messageSeq &&
        candidate.senderId === input.currentUserId
      );
    });
  }

  if (index < 0) return false;

  const message = cache.messages[index];
  if (message.senderId !== input.currentUserId) return false;
  if (message.status === MessageStatus.READ) return false;
  if (message.status === MessageStatus.FAILED || message.sendState === "failed") return false;
  if (
    message.status === MessageStatus.SENDING ||
    message.sendState === "sending" ||
    message.sendState === "queued" ||
    message.sendState === "retrying"
  ) {
    return false;
  }

  cache.messages[index] = mergeMessageRecords(message, {
    ...message,
    status: MessageStatus.DELIVERED,
    sendState: "sent",
    ...(input.deliveredAt
      ? { deliveredAt: input.deliveredAt as unknown as Date }
      : {}),
  });
  return true;
};

export const patchDeliveredReceiptInCache = (
  cache: ConversationMessagesCache,
  input: {
    messageId: string;
    messageSeq?: number;
    currentUserId?: string;
    deliveredAt?: string;
  },
): boolean => {
  const changed = applyDeliveredReceiptMutation(cache, input);
  if (changed) {
    refreshCacheIndex(cache);
  }
  return changed;
};

export const markMessageFailedInCache = (
  cache: ConversationMessagesCache,
  clientMessageId: string,
  failure?:
    | string
    | {
        message?: string;
        code?: string;
        statusCode?: number;
      },
): void => {
  const failureMessage =
    typeof failure === "string" ? failure : failure?.message;
  const failureCode = typeof failure === "string" ? undefined : failure?.code;
  const failureStatusCode =
    typeof failure === "string" ? undefined : failure?.statusCode;
  const failureReason =
    typeof failureStatusCode === "number"
      ? failureStatusCode >= 500
        ? "backend_5xx"
        : failureStatusCode >= 400
          ? "backend_4xx"
          : "server"
      : "server";

  patchMessageInCache(cache, clientMessageId, {
    status: MessageStatus.FAILED,
    sendState: "failed",
    failureReason,
    errorCode: failureCode,
    errorMessage: failureMessage,
  });
};
