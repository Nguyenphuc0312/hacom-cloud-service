import { MessageStatus } from "../../../types";
import type { Message, Reaction } from "../../../types";
import {
  findMessageIdentityIndex,
  getStableMessageId,
  isTempMessageId,
  messagesShareIdentity,
} from "./messageIdentity";
import {
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

const getMessageSeq = (message: Message): number | null =>
  typeof message.serverSeq === "number" && Number.isFinite(message.serverSeq)
    ? message.serverSeq
    : null;

const isLocalPendingMessage = (message: Message): boolean =>
  message.transportStatus === "optimistic" ||
  message.sendState === "sending" ||
  message.sendState === "queued" ||
  message.sendState === "retrying" ||
  message.sendState === "failed";

const indexMessagesById = (messages: readonly Message[]) =>
  messages.reduce<Record<string, Message>>((accumulator, message) => {
    accumulator[getStableMessageId(message)] = message;
    accumulator[message.id] = message;
    return accumulator;
  }, {});

const refreshCacheIndex = (cache: ConversationMessagesCache): void => {
  const oldest = cache.messages[0] ?? null;
  const newest = cache.messages[cache.messages.length - 1] ?? null;

  cache.messageById = indexMessagesById(cache.messages);
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
  const oldest = orderedMessages[0] ?? null;
  const newest = orderedMessages[orderedMessages.length - 1] ?? null;

  return {
    conversationId,
    messages: orderedMessages,
    messageById: indexMessagesById(orderedMessages),
    messageIds: orderedMessages.map(getStableMessageId),
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
    sendState:
      incoming.sendState === "failed"
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
    cache.messages.splice(existingIndex, 1);
    cache.messages.splice(
      findSortedInsertIndex(cache.messages, merged),
      0,
      merged,
    );
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

export const patchMessageReactionInCache = (
  cache: ConversationMessagesCache,
  input: {
    messageId: string;
    emoji: string;
    userId?: string;
  },
  action: "add" | "remove",
): void => {
  const currentMessage = cache.messages.find((message) =>
    [
      message.id,
      message.localId,
      message.stableId,
      message.clientMessageId,
    ].some((value) => value === input.messageId),
  );

  if (!currentMessage) return;

  patchMessageInCache(cache, input.messageId, {
    reactions: patchReactionSummary(
      currentMessage,
      input.emoji,
      input.userId,
      action,
    ),
  });
};

export const patchReadCursorInCache = (
  cache: ConversationMessagesCache,
  input: {
    lastReadMessageId?: string;
    lastReadSeq?: number;
    currentUserId?: string;
    readerId?: string;
  },
): void => {
  if (!input.currentUserId) return;
  if (input.readerId && input.readerId === input.currentUserId) return;

  const boundaryIndex = input.lastReadMessageId
    ? findMessageIdentityIndex(cache.messages, {
        id: input.lastReadMessageId,
        localId: input.lastReadMessageId,
        stableId: input.lastReadMessageId,
        clientMessageId: input.lastReadMessageId,
      })
    : -1;
  const readAt = new Date().toISOString() as unknown as Date;
  const messagesToPatch = cache.messages.filter((message, index) => {
    if (message.senderId !== input.currentUserId) return false;
    if (message.status === MessageStatus.READ) return false;

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

    if (boundaryIndex < 0) {
      return (
        withinSeqBoundary ||
        (input.lastReadMessageId
          ? messagesShareIdentity(message, {
              id: input.lastReadMessageId,
              localId: input.lastReadMessageId,
              stableId: input.lastReadMessageId,
              clientMessageId: input.lastReadMessageId,
            })
          : false)
      );
    }

    return withinSeqBoundary || index <= boundaryIndex;
  });

  for (const message of messagesToPatch) {
    patchMessageInCache(cache, message.id, {
      status: MessageStatus.READ,
      readAt,
    });
  }
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
