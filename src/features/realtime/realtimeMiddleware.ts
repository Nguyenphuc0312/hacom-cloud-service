import {
  createAction,
  type Middleware,
  type ThunkDispatch,
  type UnknownAction,
} from "@reduxjs/toolkit";
import type { Message } from "../../types";
import { MessageStatus } from "../../types";
import {
  chatApi,
  getMessageQueryArgForConversation,
  messagesQueryKey,
} from "../api/chatApi";
import {
  buildConversationMessagesCache,
  patchMessageInCache,
  removeMessageFromCache,
  upsertMessageInCache,
} from "../chat/domain/messageMerge";
import { normalizeMessageForReduxCache } from "../chat/domain/serializableMessage";
import { useChatStore } from "../../stores";
import { markChatPerformance } from "../../utils/chatPerformance";
import { logMessageDebug } from "../../utils/messageDebug";
import { logger } from "../../utils/logger";
import {
  createRealtimeBatchCoordinator,
  type RealtimeBatchCoordinator,
} from "./realtimeBatchCoordinator";

export interface RealtimeMessagePayload {
  conversationId: string;
  message: Message;
}

export type RealtimeDeleteMode = "RECALL" | "ADMIN_DELETE" | "FOR_ME";

export interface RealtimeMessageDeletedPayload {
  conversationId: string;
  messageId: string;
  /** Chế độ xóa. Nếu thiếu (event legacy), xử lý như RECALL để giữ behavior cũ. */
  mode?: RealtimeDeleteMode;
  recalledBy?: string;
  recalledAt?: string;
  deletedBy?: string;
  deletedAt?: string;
  /** @deprecated giữ cho backward-compat; dùng mode thay thế. */
  revoked?: boolean;
}

export interface RealtimeReadCursorPayload {
  conversationId: string;
  lastReadMessageId?: string;
  lastReadSeq?: number;
  currentUserId?: string;
  readerId?: string;
}

export interface RealtimeMessageDeliveredPayload {
  conversationId: string;
  messageId: string;
  messageSeq?: number;
  currentUserId?: string;
  recipientUserId?: string;
  deliveredAt?: string;
}

export interface RealtimeMessageReactionPayload {
  conversationId: string;
  messageId: string;
  emoji: string;
  userId?: string;
  action: "add" | "remove";
}

const prepareRealtimeMessagePayload = (payload: RealtimeMessagePayload) => ({
  payload: {
    ...payload,
    message: normalizeMessageForReduxCache(payload.message),
  },
});

export const realtimeMessageReceived = createAction(
  "realtime/messageReceived",
  prepareRealtimeMessagePayload,
);
export const realtimeMessageUpdated = createAction(
  "realtime/messageUpdated",
  prepareRealtimeMessagePayload,
);
export const realtimeMessageDeleted =
  createAction<RealtimeMessageDeletedPayload>("realtime/messageDeleted");
export const realtimeReadCursorUpdated =
  createAction<RealtimeReadCursorPayload>("realtime/readCursorUpdated");
export const realtimeMessageDelivered =
  createAction<RealtimeMessageDeliveredPayload>("realtime/messageDelivered");
export const realtimeMessageReactionChanged =
  createAction<RealtimeMessageReactionPayload>(
    "realtime/messageReactionChanged",
  );

const shouldSeedMissingMessageCache = (
  conversationId: string,
  message: Message,
): boolean =>
  message.transportStatus === "optimistic" ||
  message.sendState === "sending" ||
  message.sendState === "queued" ||
  message.sendState === "retrying" ||
  message.sendState === "failed" ||
  useChatStore.getState().selectedConversationId === conversationId;

export const normalizeRealtimeMessageEvent = (
  payload: unknown,
): RealtimeMessagePayload | null => {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const conversationId =
    typeof record.conversationId === "string"
      ? record.conversationId
      : typeof record.roomId === "string"
        ? record.roomId
        : null;
  const message =
    record.message && typeof record.message === "object"
      ? (record.message as Message)
      : null;

  return conversationId && message
    ? { conversationId, message: normalizeMessageForReduxCache(message) }
    : null;
};

type ChatApiReducerState = ReturnType<typeof chatApi.reducer>;
type RealtimeMiddlewareState = {
  [chatApi.reducerPath]: ChatApiReducerState;
};
type RealtimeDispatch = ThunkDispatch<
  RealtimeMiddlewareState,
  unknown,
  UnknownAction
>;

// Lazily created once the store is available. High-frequency metadata events
// (delivered/read/reaction) are coalesced here and flushed once per frame.
let batchCoordinator: RealtimeBatchCoordinator | null = null;
const getBatchCoordinator = (
  dispatch: RealtimeDispatch,
): RealtimeBatchCoordinator => {
  if (!batchCoordinator) {
    batchCoordinator = createRealtimeBatchCoordinator(dispatch);
  }
  return batchCoordinator;
};

/** Test/diagnostic seam: flush any pending realtime batch synchronously. */
export const flushRealtimeBatchesForTest = (): void => {
  batchCoordinator?.flush();
};

/** Test seam: reset the module-level coordinator between test cases. */
export const __resetRealtimeBatchCoordinator = (): void => {
  batchCoordinator?.dispose();
  batchCoordinator = null;
};

export const realtimeMiddleware: Middleware<
  object,
  RealtimeMiddlewareState,
  RealtimeDispatch
> = (storeApi) => (next) => (action) => {
  const result = next(action);

  if (realtimeMessageReceived.match(action)) {
    const beforeCache =
      chatApi.endpoints.getMessages.select(
        getMessageQueryArgForConversation(action.payload.conversationId),
      )(storeApi.getState()).data?.messages ?? [];
    logMessageDebug("realtimeMiddleware", "[RTKQ CACHE KEY]", {
      conversationId: action.payload.conversationId,
      endpointName: "getMessages",
      key: messagesQueryKey(action.payload.conversationId),
      args: getMessageQueryArgForConversation(action.payload.conversationId),
    });
    logMessageDebug("realtimeMiddleware", "[MESSAGE CACHE BEFORE]", {
      conversationId: action.payload.conversationId,
      messageId: action.payload.message.id,
      clientMessageId: action.payload.message.clientMessageId,
      messageSeq:
        action.payload.message.serverSeq ?? action.payload.message.messageSeq,
      messageCount: beforeCache.length,
      lastMessageId: beforeCache[beforeCache.length - 1]?.id ?? null,
      activeConversationId: useChatStore.getState().selectedConversationId,
      documentVisibility:
        typeof document !== "undefined" ? document.visibilityState : "unknown",
    });
    markChatPerformance("fe.cache.patch.start", action.payload.conversationId, {
      messageId: action.payload.message.id,
      clientMessageId: action.payload.message.clientMessageId,
      messageSeq:
        action.payload.message.serverSeq ?? action.payload.message.messageSeq,
    });
    const patch = storeApi.dispatch(
      chatApi.util.updateQueryData(
        "getMessages",
        getMessageQueryArgForConversation(action.payload.conversationId),
        (draft) => {
          upsertMessageInCache(draft, action.payload.message);
        },
      ),
    );
    if (
      patch.patches.length === 0 &&
      shouldSeedMissingMessageCache(
        action.payload.conversationId,
        action.payload.message,
      )
    ) {
      storeApi.dispatch(
        chatApi.util.upsertQueryData(
          "getMessages",
          getMessageQueryArgForConversation(action.payload.conversationId),
          buildConversationMessagesCache(action.payload.conversationId, [
            action.payload.message,
          ]),
        ),
      );
    }
    const afterCache =
      chatApi.endpoints.getMessages.select(
        getMessageQueryArgForConversation(action.payload.conversationId),
      )(storeApi.getState()).data?.messages ?? [];
    logMessageDebug("realtimeMiddleware", "[MESSAGE APPEND AFTER]", {
      conversationId: action.payload.conversationId,
      messageId: action.payload.message.id,
      patchCount: patch.patches.length,
      seededMissingCache: patch.patches.length === 0 &&
        shouldSeedMissingMessageCache(
          action.payload.conversationId,
          action.payload.message,
        ),
      messageCount: afterCache.length,
      lastMessageId: afterCache[afterCache.length - 1]?.id ?? null,
      appendedToActiveList:
        useChatStore.getState().selectedConversationId ===
        action.payload.conversationId,
    });
    markChatPerformance("fe.cache.patch.done", action.payload.conversationId, {
      messageId: action.payload.message.id,
      clientMessageId: action.payload.message.clientMessageId,
      patchCount: patch.patches.length,
    });
    logMessageDebug("realtimeMiddleware", "realtime.message.cache_updated", {
      conversationId: action.payload.conversationId,
      messageId: action.payload.message.id,
      clientMessageId: action.payload.message.clientMessageId,
      patchCount: patch.patches.length,
      activeConversationId: useChatStore.getState().selectedConversationId,
      appendedToActiveList:
        useChatStore.getState().selectedConversationId ===
        action.payload.conversationId,
    });
  }

  if (realtimeMessageUpdated.match(action)) {
    if (!action.payload.conversationId) {
      logger.warn("realtime-middleware", "message_update_missing_conversation_id", {
        payload: action.payload,
      });
      return result;
    }
    const patch = storeApi.dispatch(
      chatApi.util.updateQueryData(
        "getMessages",
        getMessageQueryArgForConversation(action.payload.conversationId),
        (draft) => {
          upsertMessageInCache(draft, action.payload.message);
        },
      ),
    );
    if (
      patch.patches.length === 0 &&
      shouldSeedMissingMessageCache(
        action.payload.conversationId,
        action.payload.message,
      )
    ) {
      storeApi.dispatch(
        chatApi.util.upsertQueryData(
          "getMessages",
          getMessageQueryArgForConversation(action.payload.conversationId),
          buildConversationMessagesCache(action.payload.conversationId, [
            action.payload.message,
          ]),
        ),
      );
    }
  }

  if (realtimeMessageDeleted.match(action)) {
    const {
      conversationId,
      messageId,
      mode,
      recalledBy,
      recalledAt,
      deletedBy,
      deletedAt,
    } = action.payload;
    storeApi.dispatch(
      chatApi.util.updateQueryData(
        "getMessages",
        getMessageQueryArgForConversation(conversationId),
        (draft) => {
          if (mode === "FOR_ME") {
            removeMessageFromCache(draft, messageId);
            return;
          }

          const now = new Date().toISOString() as unknown as Date;
          const patch: Partial<Message> = {
            isDeleted: true,
            content: "",
            attachments: [],
            sendState: "sent",
            status: MessageStatus.SENT,
            failureReason: undefined,
            errorCode: undefined,
            errorMessage: undefined,
          };
          if (mode === "ADMIN_DELETE") {
            patch.lifecycleStatus = "deleted_admin";
            if (deletedBy) patch.deletedBy = deletedBy;
            patch.deletedAt = deletedAt
              ? (new Date(deletedAt) as unknown as Date)
              : now;
          } else {
            // RECALL hoặc legacy event: mặc định coi là recall (đồng nhất với behavior cũ)
            patch.lifecycleStatus = "recalled";
            if (recalledBy) patch.recalledBy = recalledBy;
            patch.recalledAt = recalledAt
              ? (new Date(recalledAt) as unknown as Date)
              : now;
          }
          patchMessageInCache(draft, messageId, patch);
        },
      ),
    );

    // Sync conversation lastMessage preview in Zustand (sidebar)
    const storeState = useChatStore.getState();
    const affectedConv = storeState.conversationById[conversationId];
    if (affectedConv?.lastMessage?.id === messageId) {
      if (mode === "FOR_ME") {
        // Delete-for-me: clear preview immediately; snapshot refresh will fill in next message
        storeState.updateConversation(conversationId, { lastMessage: undefined });
      } else {
        // Recall / admin-delete: replace preview with recalled placeholder
        storeState.updateConversation(conversationId, {
          lastMessage: {
            ...affectedConv.lastMessage,
            isDeleted: true,
            content: "",
          },
        });
      }
    }
  }

  // High-frequency metadata events are coalesced per conversation and flushed
  // once per animation frame (see realtimeBatchCoordinator). This keeps a burst
  // of N delivered/read/reaction events from triggering N timeline derivations.
  if (realtimeMessageReactionChanged.match(action)) {
    getBatchCoordinator(storeApi.dispatch).enqueueReaction(action.payload);
  }

  if (realtimeReadCursorUpdated.match(action)) {
    if (
      action.payload.lastReadMessageId ||
      typeof action.payload.lastReadSeq === "number"
    ) {
      getBatchCoordinator(storeApi.dispatch).enqueueReadCursor(action.payload);
    }
  }

  if (realtimeMessageDelivered.match(action)) {
    getBatchCoordinator(storeApi.dispatch).enqueueDelivered(action.payload);
  }

  return result;
};
