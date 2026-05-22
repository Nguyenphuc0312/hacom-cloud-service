import {
  createAction,
  type Middleware,
  type ThunkDispatch,
  type UnknownAction,
} from "@reduxjs/toolkit";
import type { Message } from "../../types";
import { MessageStatus } from "../../types";
import { chatApi } from "../api/chatApi";
import {
  buildConversationMessagesCache,
  patchMessageReactionInCache,
  patchDeliveredReceiptInCache,
  patchMessageInCache,
  patchReadCursorInCache,
  removeMessageFromCache,
  upsertMessageInCache,
} from "../chat/domain/messageMerge";
import { normalizeMessageForReduxCache } from "../chat/domain/serializableMessage";
import { useChatStore } from "../../stores";
import { markChatPerformance } from "../../utils/chatPerformance";

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

const getMessageQueryArg = (conversationId: string) => ({ conversationId });

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

export const realtimeMiddleware: Middleware<
  object,
  RealtimeMiddlewareState,
  RealtimeDispatch
> = (storeApi) => (next) => (action) => {
  const result = next(action);

  if (realtimeMessageReceived.match(action)) {
    markChatPerformance("fe.cache.patch.start", action.payload.conversationId, {
      messageId: action.payload.message.id,
      clientMessageId: action.payload.message.clientMessageId,
      messageSeq:
        action.payload.message.serverSeq ?? action.payload.message.messageSeq,
    });
    const patch = storeApi.dispatch(
      chatApi.util.updateQueryData(
        "getMessages",
        getMessageQueryArg(action.payload.conversationId),
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
          getMessageQueryArg(action.payload.conversationId),
          buildConversationMessagesCache(action.payload.conversationId, [
            action.payload.message,
          ]),
        ),
      );
    }
    markChatPerformance("fe.cache.patch.done", action.payload.conversationId, {
      messageId: action.payload.message.id,
      clientMessageId: action.payload.message.clientMessageId,
      patchCount: patch.patches.length,
    });
  }

  if (realtimeMessageUpdated.match(action)) {
    const patch = storeApi.dispatch(
      chatApi.util.updateQueryData(
        "getMessages",
        getMessageQueryArg(action.payload.conversationId),
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
          getMessageQueryArg(action.payload.conversationId),
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
        getMessageQueryArg(conversationId),
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

  if (realtimeMessageReactionChanged.match(action)) {
    storeApi.dispatch(
      chatApi.util.updateQueryData(
        "getMessages",
        getMessageQueryArg(action.payload.conversationId),
        (draft) => {
          patchMessageReactionInCache(
            draft,
            {
              messageId: action.payload.messageId,
              emoji: action.payload.emoji,
              userId: action.payload.userId,
            },
            action.payload.action,
          );
        },
      ),
    );
  }

  if (realtimeReadCursorUpdated.match(action)) {
    if (
      action.payload.lastReadMessageId ||
      typeof action.payload.lastReadSeq === "number"
    ) {
      storeApi.dispatch(
        chatApi.util.updateQueryData(
          "getMessages",
          getMessageQueryArg(action.payload.conversationId),
          (draft) => {
            patchReadCursorInCache(draft, {
              lastReadMessageId: action.payload.lastReadMessageId,
              lastReadSeq: action.payload.lastReadSeq,
              currentUserId: action.payload.currentUserId,
              readerId: action.payload.readerId,
            });
          },
        ),
      );
    }
  }

  if (realtimeMessageDelivered.match(action)) {
    storeApi.dispatch(
      chatApi.util.updateQueryData(
        "getMessages",
        getMessageQueryArg(action.payload.conversationId),
        (draft) => {
          patchDeliveredReceiptInCache(draft, {
            messageId: action.payload.messageId,
            messageSeq: action.payload.messageSeq,
            currentUserId: action.payload.currentUserId,
            deliveredAt: action.payload.deliveredAt,
          });
        },
      ),
    );
  }

  return result;
};
