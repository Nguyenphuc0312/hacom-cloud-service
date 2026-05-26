import { ErrorCode } from "@hacom/chat-shared-types/core";
import type { MarkReadResponseData } from "@hacom/chat-shared-types/chat";
import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query/react";
import {
  ApiContractError,
  extractApiError,
  unwrapApiSuccess,
} from "../../lib/apiContract";
import {
  normalizeConversation,
  normalizeConversationsPayload,
} from "../../lib/conversationAdapter";
import { conversationApi, messageApi, conversationResourcesApi, fileApi } from "../../services/api";
import type {
  ConversationSidebarSummary,
  ConversationResourcesMediaItem,
  ConversationResourcesFileItem,
  ConversationResourcesLinkItem,
  ConversationResourcesPaginatedResult,
} from "../../services/api";
import { MessageStatus, MessageType } from "../../types";
import type { Attachment, Conversation, Mention, Message } from "../../types";
import {
  buildConversationMessagesCache,
  markMessageFailedInCache,
  mergeIncomingMessagesPage,
  patchMessageReactionInCache,
  patchMessageInCache,
  removeMessageFromCache,
  upsertMessageInCache,
} from "../chat/domain/messageMerge";
import type {
  ConversationMessagesCache,
  MessageMergeMode,
} from "../chat/domain/messageMerge";
import { MESSAGE_HARD_LIMIT } from "../../utils/messageLengthPolicy";

export interface GetConversationsArgs {
  page?: number;
  limit?: number;
  updatedAfter?: string;
}

export interface GetMessagesArgs {
  conversationId: string;
  beforeId?: string;
  afterId?: string;
  beforeSeq?: number;
  afterSeq?: number;
  limit?: number;
}

export interface SendMessageInput {
  conversationId: string;
  clientMessageId: string;
  content: string;
  contentFormat?: 'plain_text' | 'rich_text';
  contentJson?: Record<string, unknown>;
  plainText?: string;
  type?: Message["type"];
  replyToId?: string;
  /**
   * Original message being replied to. Carried alongside `replyToId` so the
   * optimistic bubble can render the quote block immediately, before the server
   * ack arrives with the canonical `replyToMessage` snapshot.
   */
  replyToMessage?: Message;
  senderId?: string;
  senderName?: string;
  senderAvatar?: string;
  localId?: string;
  /**
   * Mentions with resolved display name for optimistic rendering.
   * The RTK mutation extracts userIds for the API payload.
   */
  mentions?: {
    userId: string;
    displayName: string;
  }[];
  attachments?: SendMessageAttachmentInput[];
}

export interface SendMessageAttachmentInput {
  id: string;
  type: Attachment["type"];
  objectKey?: string;
  url?: string;
  downloadUrl?: string;
  expiresAt?: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  width?: number;
  height?: number;
  duration?: number;
  thumbnailUrl?: string;
}

export interface EditMessageInput {
  conversationId: string;
  messageId: string;
  content: string;
}

export type DeleteMessageMode = "FOR_ME" | "FOR_EVERYONE";

export interface DeleteMessageInput {
  conversationId: string;
  messageId: string;
  mode: DeleteMessageMode;
}

export interface ReactToMessageInput {
  conversationId: string;
  messageId: string;
  emoji: string;
  userId?: string;
}

export interface MarkConversationReadInput {
  conversationId: string;
  lastVisibleMessageId?: string;
  lastReadSeq?: number;
  messageId?: string;
}

export interface SearchMessagesArgs {
  conversationId?: string;
  q: string;
  page?: number;
  limit?: number;
}

export interface UnreadSummary {
  totalUnreadCount: number;
  conversations: Array<{
    conversationId: string;
    unreadCount: number;
    lastReadSeq: number;
    lastReadMessageId: string | null;
    lastReadAt: string | null;
  }>;
}

interface MessageResponseEnvelope {
  messages: Message[];
  hasMoreOlder: boolean;
  hasMoreNewer: boolean;
}

type ExtractedApiError = ReturnType<typeof extractApiError>;

interface ChatQueryError {
  name: string;
  status: number;
  message: string;
  statusCode: number;
  code: ExtractedApiError["code"];
  details?: unknown;
  requestId?: string;
  retryAfterSeconds?: number;
  isNetworkError: boolean;
  isAuthError: boolean;
  isRateLimit: boolean;
}

const toChatQueryError = (error: unknown): ChatQueryError => {
  const apiError = extractApiError(error);
  return {
    name: apiError.name,
    status: apiError.status,
    message: apiError.message,
    statusCode: apiError.statusCode,
    code: apiError.code,
    details: apiError.details,
    requestId: apiError.requestId,
    retryAfterSeconds: apiError.retryAfterSeconds,
    isNetworkError: apiError.isNetworkError,
    isAuthError: apiError.isAuthError,
    isRateLimit: apiError.isRateLimit,
  };
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;

const readBoolean = (
  source: Record<string, unknown> | null,
  keys: string[],
): boolean | null => {
  if (!source) return null;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "boolean") {
      return value;
    }
  }
  return null;
};

const extractMessagesEnvelope = (
  payload: unknown,
  responseMeta: unknown,
): MessageResponseEnvelope => {
  const payloadRecord = asRecord(payload);
  const metaRecord = asRecord(responseMeta);
  const rawMessages = Array.isArray(payload)
    ? payload
    : Array.isArray(payloadRecord?.messages)
      ? payloadRecord.messages
      : Array.isArray(payloadRecord?.data)
        ? payloadRecord.data
        : [];

  const payloadMeta = asRecord(payloadRecord?.meta);
  const pagination = asRecord(payloadRecord?.pagination);
  const responsePagination = asRecord(metaRecord?.pagination);
  const hasMoreNewer =
    readBoolean(payloadMeta, ["hasNext", "hasNextPage"]) ??
    readBoolean(metaRecord, ["hasNext", "hasNextPage"]) ??
    readBoolean(pagination, ["hasNext", "hasNextPage"]) ??
    readBoolean(responsePagination, ["hasNext", "hasNextPage"]) ??
    false;
  const hasMoreOlder =
    readBoolean(payloadMeta, ["hasPrev", "hasPrevPage", "hasMore"]) ??
    readBoolean(metaRecord, ["hasPrev", "hasPrevPage", "hasMore"]) ??
    readBoolean(pagination, ["hasPrev", "hasPrevPage", "hasMore"]) ??
    readBoolean(responsePagination, ["hasPrev", "hasPrevPage", "hasMore"]) ??
    false;

  return {
    messages: rawMessages.filter(
      (message): message is Message =>
        Boolean(message) && typeof message === "object",
    ),
    hasMoreOlder,
    hasMoreNewer,
  };
};

const resolveMergeMode = (arg: GetMessagesArgs): MessageMergeMode => {
  if (arg.beforeId || typeof arg.beforeSeq === "number") return "prepend";
  if (arg.afterId || typeof arg.afterSeq === "number") return "append";
  return "replace";
};

const getMessageQueryArgForConversation = (
  conversationId: string,
): GetMessagesArgs => ({ conversationId });

/**
 * Normalize server-returned mentions to the client Mention object shape.
 * The server sends string[] (userId), but the client Message type uses Mention[].
 */
const normalizeMentionsFromServer = (mentions: unknown): Mention[] | undefined => {
  if (!Array.isArray(mentions) || mentions.length === 0) return undefined;
  return mentions.map((m): Mention =>
    typeof m === "string"
      ? { userId: m, displayName: "" }
      : { userId: String((m as Record<string, unknown>).userId ?? ""), displayName: String((m as Record<string, unknown>).displayName ?? "") },
  );
};

/**
 * Coerce a raw server Message response to the client Message type.
 * Only normalizes the fields that differ between the two shapes.
 */
const coerceServerMessageToClientMessage = (raw: unknown): Message =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ({ ...(raw as any), mentions: normalizeMentionsFromServer((raw as any).mentions) }) as Message;

export const buildOptimisticMessage = (input: SendMessageInput): Message => {
  const localId = input.localId || `temp-${input.clientMessageId}`;
  return {
    id: localId,
    stableId: input.clientMessageId,
    clientMessageId: input.clientMessageId,
    localId,
    conversationId: input.conversationId,
    senderId: input.senderId || "current-user",
    senderName: input.senderName || "",
    senderAvatar: input.senderAvatar,
    content: input.content,
    contentFormat: input.contentFormat,
    contentJson: input.contentJson,
    plainText: input.plainText,
    type: input.type || MessageType.TEXT,
    status: MessageStatus.SENDING,
    sendState: "sending",
    transportStatus: "optimistic",
    isEdited: false,
    isPinned: false,
    isDeleted: false,
    isSystem: false,
    createdAt: new Date().toISOString() as unknown as Date,
    ...(input.replyToId ? { replyTo: input.replyToId } : {}),
    // Build an optimistic reply preview from the original message the user
    // clicked "reply" on, so the quote block renders in the bubble immediately.
    // The server-acked Message will overwrite this with the canonical snapshot.
    ...(input.replyToMessage
      ? {
          replyToMessage: {
            id: input.replyToMessage.id,
            senderId: input.replyToMessage.senderId,
            senderName: input.replyToMessage.senderName,
            senderAvatar: input.replyToMessage.senderAvatar,
            content: input.replyToMessage.content,
            contentFormat: input.replyToMessage.contentFormat,
            type: input.replyToMessage.type,
            isDeleted: input.replyToMessage.isDeleted,
            createdAt: input.replyToMessage.createdAt,
            attachments: input.replyToMessage.attachments,
          },
        }
      : {}),
    // Mentions carry resolved displayName for optimistic rendering.
    // The server will return the canonical Mention[] with full profile data.
    ...(input.mentions?.length
      ? {
          mentions: input.mentions.map((m) => ({
            userId: m.userId,
            displayName: m.displayName || m.userId,
          })),
        }
      : {}),
    ...(input.attachments?.length ? { attachments: input.attachments } : {}),
  };
};

const createInlineMessageTooLongError = (
  actualLength: number,
): ApiContractError =>
  new ApiContractError(
    "Tin nhắn quá dài. Vui lòng rút gọn nội dung hoặc gửi dưới dạng tệp.",
    {
      statusCode: 422,
      code: ErrorCode.MESSAGE_CONTENT_TOO_LONG,
      details: {
        field: "content",
        maxLength: MESSAGE_HARD_LIMIT,
        actualLength,
      },
    },
  );

export const chatApi = createApi({
  reducerPath: "chatApi",
  baseQuery: fakeBaseQuery<ChatQueryError>(),
  tagTypes: ["Conversation", "Messages", "Unread", "ConversationResources"],
  keepUnusedDataFor: 60, // Phase 2: Keep conversation data for 60 seconds
  endpoints: (build) => ({
    getConversations: build.query<Conversation[], GetConversationsArgs | void>({
      async queryFn(args) {
        try {
          const page = args?.page ?? 1;
          const limit = args?.limit ?? 50;
          const response = await conversationApi.getConversations(page, limit, {
            updatedAfter: args?.updatedAfter,
          });
          return {
            data: normalizeConversationsPayload(unwrapApiSuccess(response)),
          };
        } catch (error) {
          return { error: toChatQueryError(error) };
        }
      },
      // Phase 2: Keep cache for 60 seconds, refetch on window focus only if stale
      keepUnusedDataFor: 60,
      providesTags: (result) =>
        result
          ? [
              ...result.map((conversation) => ({
                type: "Conversation" as const,
                id: conversation.id,
              })),
              { type: "Conversation" as const, id: "LIST" },
            ]
          : [{ type: "Conversation" as const, id: "LIST" }],
    }),

    getConversationById: build.query<Conversation, string>({
      async queryFn(conversationId) {
        try {
          const response =
            await conversationApi.getConversationById(conversationId);
          const normalized = normalizeConversation(unwrapApiSuccess(response));
          if (!normalized) {
            throw new Error("Invalid conversation response");
          }
          return { data: normalized };
        } catch (error) {
          return { error: toChatQueryError(error) };
        }
      },
      providesTags: (_result, _error, conversationId) => [
        { type: "Conversation", id: conversationId },
      ],
    }),

    getMessages: build.query<ConversationMessagesCache, GetMessagesArgs>({
      async queryFn(arg) {
        try {
          const response = await messageApi.getMessages(arg.conversationId, {
            limit: arg.limit,
            beforeId: arg.beforeId,
            afterId: arg.afterId,
            beforeSeq: arg.beforeSeq,
            afterSeq: arg.afterSeq,
          });
          const envelope = asRecord(response);
          const payload = unwrapApiSuccess(response);
          const normalized = extractMessagesEnvelope(payload, envelope?.meta);
          return {
            data: buildConversationMessagesCache(
              arg.conversationId,
              normalized.messages,
              {
                hasMoreOlder: normalized.hasMoreOlder,
                hasMoreNewer: normalized.hasMoreNewer,
              },
            ),
          };
        } catch (error) {
          return { error: toChatQueryError(error) };
        }
      },
      serializeQueryArgs: ({ endpointName, queryArgs }) =>
        `${endpointName}:${queryArgs.conversationId}`,
      merge(currentCache, incomingCache, { arg }) {
        const next = mergeIncomingMessagesPage(
          currentCache,
          {
            conversationId: incomingCache.conversationId,
            messages: incomingCache.messages,
            hasMoreOlder: incomingCache.hasMoreOlder,
            hasMoreNewer: incomingCache.hasMoreNewer,
          },
          resolveMergeMode(arg),
        );
        Object.assign(currentCache, next);
      },
      forceRefetch({ currentArg, previousArg }) {
        return (
          currentArg?.conversationId !== previousArg?.conversationId ||
          currentArg?.beforeId !== previousArg?.beforeId ||
          currentArg?.afterId !== previousArg?.afterId ||
          currentArg?.beforeSeq !== previousArg?.beforeSeq ||
          currentArg?.afterSeq !== previousArg?.afterSeq ||
          currentArg?.limit !== previousArg?.limit
        );
      },
      providesTags: (_result, _error, arg) => [
        { type: "Messages", id: arg.conversationId },
      ],
    }),

    getMessageById: build.query<Message, string>({
      async queryFn(messageId) {
        try {
          const response = await messageApi.getMessageById(messageId);
          return { data: coerceServerMessageToClientMessage(unwrapApiSuccess(response)) };
        } catch (error) {
          return { error: toChatQueryError(error) };
        }
      },
    }),

    sendMessage: build.mutation<Message, SendMessageInput>({
      async queryFn(input) {
        if (input.content.length > MESSAGE_HARD_LIMIT) {
          return {
            error: toChatQueryError(
              createInlineMessageTooLongError(input.content.length),
            ),
          };
        }

        try {
          const response = await messageApi.sendMessage(input.conversationId, {
            content: input.content,
            contentFormat: input.contentFormat,
            contentJson: input.contentJson,
            plainText: input.plainText,
            type: input.type,
            replyToId: input.replyToId,
            clientMessageId: input.clientMessageId,
            tempId: input.localId,
            localId: input.localId,
            // API expects string[] of userIds
            mentions: input.mentions?.map((m) => m.userId),
            attachments: input.attachments,
          });
          return { data: coerceServerMessageToClientMessage(unwrapApiSuccess(response)) };
        } catch (error) {
          return { error: toChatQueryError(error) };
        }
      },
      async onQueryStarted(input, { dispatch, queryFulfilled }) {
        if (input.content.length > MESSAGE_HARD_LIMIT) {
          return;
        }

        const queryArg = getMessageQueryArgForConversation(
          input.conversationId,
        );
        const optimisticMessage = buildOptimisticMessage(input);
        const optimisticPatch = dispatch(
          chatApi.util.updateQueryData("getMessages", queryArg, (draft) => {
            upsertMessageInCache(draft, optimisticMessage);
          }),
        );
        if (optimisticPatch.patches.length === 0) {
          dispatch(
            chatApi.util.upsertQueryData(
              "getMessages",
              queryArg,
              buildConversationMessagesCache(input.conversationId, [
                optimisticMessage,
              ]),
            ),
          );
        }

        try {
          const { data } = await queryFulfilled;
          dispatch(
            chatApi.util.updateQueryData("getMessages", queryArg, (draft) => {
              upsertMessageInCache(draft, {
                ...data,
                stableId: input.clientMessageId,
                clientMessageId: input.clientMessageId,
                localId: input.localId || `temp-${input.clientMessageId}`,
                sendState: "sent",
                transportStatus:
                  typeof data.serverSeq === "number"
                    ? "synced_stream"
                    : "acked_transport",
              });
            }),
          );
          // Invalidate sidebar summary when media/file/link messages land
          const RESOURCE_TYPES = new Set(["image", "video", "audio", "gif", "media", "file", "link"]);
          if (input.type && RESOURCE_TYPES.has(input.type)) {
            dispatch(
              chatApi.util.invalidateTags([
                { type: "ConversationResources" as const, id: `${input.conversationId}-summary` },
              ]),
            );
          }
        } catch (error) {
          const normalizedError = extractApiError(error);
          dispatch(
            chatApi.util.updateQueryData("getMessages", queryArg, (draft) => {
              markMessageFailedInCache(draft, input.clientMessageId, {
                message: normalizedError.message,
                code: normalizedError.code,
                statusCode: normalizedError.statusCode,
              });
            }),
          );
        }
      },
    }),

    editMessage: build.mutation<Message, EditMessageInput>({
      async queryFn(input) {
        try {
          const response = await messageApi.editMessage(
            input.messageId,
            input.content,
          );
          return { data: unwrapApiSuccess(response) };
        } catch (error) {
          return { error: toChatQueryError(error) };
        }
      },
      async onQueryStarted(input, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          chatApi.util.updateQueryData(
            "getMessages",
            getMessageQueryArgForConversation(input.conversationId),
            (draft) => {
              patchMessageInCache(draft, input.messageId, {
                content: input.content,
                isEdited: true,
                editedAt: new Date().toISOString() as unknown as Date,
              });
            },
          ),
        );

        try {
          const { data } = await queryFulfilled;
          dispatch(
            chatApi.util.updateQueryData(
              "getMessages",
              getMessageQueryArgForConversation(input.conversationId),
              (draft) => {
                upsertMessageInCache(draft, data);
              },
            ),
          );
        } catch {
          patch.undo();
        }
      },
    }),

    deleteMessage: build.mutation<void, DeleteMessageInput>({
      async queryFn(input) {
        try {
          await messageApi.deleteMessage(input.messageId, { mode: input.mode });
          return { data: undefined };
        } catch (error) {
          return { error: toChatQueryError(error) };
        }
      },
      async onQueryStarted(input, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          chatApi.util.updateQueryData(
            "getMessages",
            getMessageQueryArgForConversation(input.conversationId),
            (draft) => {
              if (input.mode === "FOR_ME") {
                removeMessageFromCache(draft, input.messageId);
              } else {
                patchMessageInCache(draft, input.messageId, {
                  isDeleted: true,
                  lifecycleStatus: "recalled",
                  content: "",
                  attachments: [],
                  sendState: "sent",
                  status: MessageStatus.SENT,
                  failureReason: undefined,
                  errorCode: undefined,
                  errorMessage: undefined,
                });
              }
            },
          ),
        );

        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
    }),

    addReaction: build.mutation<Message, ReactToMessageInput>({
      async queryFn(input) {
        try {
          const response = await messageApi.addReaction(
            input.messageId,
            input.emoji,
          );
          return { data: unwrapApiSuccess(response) };
        } catch (error) {
          return { error: toChatQueryError(error) };
        }
      },
      async onQueryStarted(input, { dispatch, queryFulfilled }) {
        const queryArg = getMessageQueryArgForConversation(
          input.conversationId,
        );
        const patch = dispatch(
          chatApi.util.updateQueryData("getMessages", queryArg, (draft) => {
            patchMessageReactionInCache(draft, input, "add");
          }),
        );

        try {
          const { data } = await queryFulfilled;
          dispatch(
            chatApi.util.updateQueryData("getMessages", queryArg, (draft) => {
              upsertMessageInCache(draft, data);
            }),
          );
        } catch {
          patch.undo();
        }
      },
    }),

    removeReaction: build.mutation<Message, ReactToMessageInput>({
      async queryFn(input) {
        try {
          const response = await messageApi.removeReaction(
            input.messageId,
            input.emoji,
          );
          return { data: unwrapApiSuccess(response) };
        } catch (error) {
          return { error: toChatQueryError(error) };
        }
      },
      async onQueryStarted(input, { dispatch, queryFulfilled }) {
        const queryArg = getMessageQueryArgForConversation(
          input.conversationId,
        );
        const patch = dispatch(
          chatApi.util.updateQueryData("getMessages", queryArg, (draft) => {
            patchMessageReactionInCache(draft, input, "remove");
          }),
        );

        try {
          const { data } = await queryFulfilled;
          dispatch(
            chatApi.util.updateQueryData("getMessages", queryArg, (draft) => {
              upsertMessageInCache(draft, data);
            }),
          );
        } catch {
          patch.undo();
        }
      },
    }),

    markConversationRead: build.mutation<
      MarkReadResponseData,
      MarkConversationReadInput
    >({
      async queryFn(input) {
        try {
          const data = await conversationApi.markAsRead(input.conversationId, {
            lastVisibleMessageId: input.lastVisibleMessageId,
            lastReadSeq: input.lastReadSeq,
            messageId: input.messageId,
          });
          return { data };
        } catch (error) {
          return { error: toChatQueryError(error) };
        }
      },
    }),

    getUnreadSummary: build.query<UnreadSummary, void>({
      async queryFn() {
        try {
          const response = await conversationApi.getUnreadSummary();
          return { data: unwrapApiSuccess(response) };
        } catch (error) {
          return { error: toChatQueryError(error) };
        }
      },
      providesTags: [{ type: "Unread", id: "SUMMARY" }],
    }),

    searchMessages: build.query<
      { messages: Message[]; total: number; page: number; limit: number },
      SearchMessagesArgs
    >({
      async queryFn(args) {
        try {
          const response = await messageApi.searchMessages({
            conversationId: args.conversationId,
            q: args.q,
            page: args.page,
            limit: args.limit,
          });
          return { data: unwrapApiSuccess(response) };
        } catch (error) {
          return { error: toChatQueryError(error) };
        }
      },
    }),

    forwardMessages: build.mutation<
      { messages: Message[] },
      { items: Array<{ sourceMessageId: string; targetConversationId: string }> }
    >({
      async queryFn(input) {
        try {
          const response = await messageApi.forwardMessages(input.items);
          return { data: unwrapApiSuccess(response) };
        } catch (error) {
          return { error: toChatQueryError(error) };
        }
      },
    }),

    getConversationSidebarSummary: build.query<ConversationSidebarSummary, string>({
      async queryFn(conversationId) {
        try {
          const response = await conversationResourcesApi.getSidebarSummary(conversationId);
          return { data: unwrapApiSuccess(response) };
        } catch (error) {
          return { error: toChatQueryError(error) };
        }
      },
      providesTags: (_result, _error, conversationId) => [
        { type: 'ConversationResources' as const, id: `${conversationId}-summary` },
      ],
    }),

    getConversationMedia: build.query<
      ConversationResourcesPaginatedResult<ConversationResourcesMediaItem>,
      { conversationId: string; page?: number; limit?: number; type?: string }
    >({
      async queryFn({ conversationId, page = 1, limit = 20, type }) {
        try {
          const response = await conversationResourcesApi.getMedia(conversationId, page, limit, type);
          return { data: unwrapApiSuccess(response) };
        } catch (error) {
          return { error: toChatQueryError(error) };
        }
      },
      providesTags: (_result, _error, { conversationId }) => [
        { type: 'ConversationResources' as const, id: `${conversationId}-media` },
      ],
    }),

    getConversationFiles: build.query<
      ConversationResourcesPaginatedResult<ConversationResourcesFileItem>,
      { conversationId: string; page?: number; limit?: number; q?: string }
    >({
      async queryFn({ conversationId, page = 1, limit = 20, q }) {
        try {
          const response = await conversationResourcesApi.getFiles(conversationId, page, limit, q);
          return { data: unwrapApiSuccess(response) };
        } catch (error) {
          return { error: toChatQueryError(error) };
        }
      },
      providesTags: (_result, _error, { conversationId }) => [
        { type: 'ConversationResources' as const, id: `${conversationId}-files` },
      ],
    }),

    getConversationLinks: build.query<
      ConversationResourcesPaginatedResult<ConversationResourcesLinkItem>,
      { conversationId: string; page?: number; limit?: number }
    >({
      async queryFn({ conversationId, page = 1, limit = 20 }) {
        try {
          const response = await conversationResourcesApi.getLinks(conversationId, page, limit);
          return { data: unwrapApiSuccess(response) };
        } catch (error) {
          return { error: toChatQueryError(error) };
        }
      },
      providesTags: (_result, _error, { conversationId }) => [
        { type: 'ConversationResources' as const, id: `${conversationId}-links` },
      ],
    }),

    batchThumbnailUrls: build.mutation<
      { items: Array<{ fileId: string; url: string | null; expiresAt: string | null; status: string }> },
      { conversationId: string; fileIds: string[] }
    >({
      async queryFn({ conversationId, fileIds }) {
        try {
          const response = await fileApi.batchThumbnailUrls({ conversationId, fileIds });
          return { data: unwrapApiSuccess(response) };
        } catch (error) {
          return { error: toChatQueryError(error) };
        }
      },
    }),
  }),
});

export const {
  useDeleteMessageMutation,
  useEditMessageMutation,
  useAddReactionMutation,
  useGetConversationByIdQuery,
  useGetConversationsQuery,
  useLazyGetMessageByIdQuery,
  useLazyGetMessagesQuery,
  useGetMessagesQuery,
  useGetUnreadSummaryQuery,
  useMarkConversationReadMutation,
  useRemoveReactionMutation,
  useSearchMessagesQuery,
  useSendMessageMutation,
  useForwardMessagesMutation,
  useGetConversationSidebarSummaryQuery,
  useGetConversationMediaQuery,
  useGetConversationFilesQuery,
  useGetConversationLinksQuery,
  useBatchThumbnailUrlsMutation,
} = chatApi;

export type { ConversationSidebarSummary, ConversationResourcesMediaItem, ConversationResourcesFileItem, ConversationResourcesLinkItem, ConversationResourcesPaginatedResult };
