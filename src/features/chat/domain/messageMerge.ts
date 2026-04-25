import { MessageStatus } from "../../../types";
import type { Message } from "../../../types";
import {
  findMessageIdentityIndex,
  getStableMessageId,
  isTempMessageId,
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
          : incoming.sendState ?? current.sendState,
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

    merged[existingIndex] = mergeMessageRecords(
      merged[existingIndex],
      message,
    );
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
    const localPendingMessages = current.messages.filter(
      (message) =>
        message.transportStatus === "optimistic" ||
        message.sendState === "sending" ||
        message.sendState === "queued" ||
        message.sendState === "retrying" ||
        message.sendState === "failed",
    );
    return buildConversationMessagesCache(
      incoming.conversationId,
      mergeMessageLists(incoming.messages, localPendingMessages),
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

export const markMessageFailedInCache = (
  cache: ConversationMessagesCache,
  clientMessageId: string,
  errorMessage?: string,
): void => {
  patchMessageInCache(cache, clientMessageId, {
    status: MessageStatus.FAILED,
    sendState: "failed",
    failureReason: "server",
    errorMessage,
  });
};
