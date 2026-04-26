import {
  createAction,
  type Middleware,
  type ThunkDispatch,
  type UnknownAction,
} from "@reduxjs/toolkit";
import type { Message } from "../../types";
import { chatApi } from "../api/chatApi";
import {
  buildConversationMessagesCache,
  patchMessageReactionInCache,
  patchMessageInCache,
  patchReadCursorInCache,
  upsertMessageInCache,
} from "../chat/domain/messageMerge";
import { normalizeMessageForReduxCache } from "../chat/domain/serializableMessage";

export interface RealtimeMessagePayload {
  conversationId: string;
  message: Message;
}

export interface RealtimeMessageDeletedPayload {
  conversationId: string;
  messageId: string;
  revoked?: boolean;
}

export interface RealtimeReadCursorPayload {
  conversationId: string;
  lastReadMessageId?: string;
  lastReadSeq?: number;
  currentUserId?: string;
  readerId?: string;
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
export const realtimeMessageReactionChanged =
  createAction<RealtimeMessageReactionPayload>(
    "realtime/messageReactionChanged",
  );

const getMessageQueryArg = (conversationId: string) => ({ conversationId });

const shouldSeedMissingMessageCache = (message: Message): boolean =>
  message.transportStatus === "optimistic" ||
  message.sendState === "sending" ||
  message.sendState === "queued" ||
  message.sendState === "retrying" ||
  message.sendState === "failed";

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
      shouldSeedMissingMessageCache(action.payload.message)
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
      shouldSeedMissingMessageCache(action.payload.message)
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
    storeApi.dispatch(
      chatApi.util.updateQueryData(
        "getMessages",
        getMessageQueryArg(action.payload.conversationId),
        (draft) => {
          patchMessageInCache(draft, action.payload.messageId, {
            isDeleted: true,
            content: "",
          });
        },
      ),
    );
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

  return result;
};
