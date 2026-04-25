import {
  createApi,
  fakeBaseQuery,
} from "@reduxjs/toolkit/query/react";
import { extractApiError, unwrapApiSuccess } from "../../lib/apiContract";
import {
  normalizeConversation,
  normalizeConversationsPayload,
} from "../../lib/conversationAdapter";
import {
  conversationApi,
  messageApi,
} from "../../services/api";
import { MessageStatus, MessageType } from "../../types";
import type { Attachment, Conversation, Message } from "../../types";
import {
  buildConversationMessagesCache,
  markMessageFailedInCache,
  mergeIncomingMessagesPage,
  patchMessageInCache,
  upsertMessageInCache,
} from "../chat/domain/messageMerge";
import type {
  ConversationMessagesCache,
  MessageMergeMode,
} from "../chat/domain/messageMerge";

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
  type?: Message["type"];
  replyToId?: string;
  senderId?: string;
  senderName?: string;
  senderAvatar?: string;
  localId?: string;
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

export interface DeleteMessageInput {
  conversationId: string;
  messageId: string;
}

export interface MarkConversationReadInput {
  conversationId: string;
  lastVisibleMessageId?: string;
  lastReadSeq?: number;
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

const buildOptimisticMessage = (input: SendMessageInput): Message => {
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
    type: input.type || MessageType.TEXT,
    status: MessageStatus.SENDING,
    sendState: "sending",
    transportStatus: "optimistic",
    isEdited: false,
    isPinned: false,
    isDeleted: false,
    isSystem: false,
    createdAt: new Date(),
    ...(input.replyToId ? { replyTo: input.replyToId } : {}),
    ...(input.attachments?.length ? { attachments: input.attachments } : {}),
  };
};

export const chatApi = createApi({
  reducerPath: "chatApi",
  baseQuery: fakeBaseQuery<ReturnType<typeof extractApiError>>(),
  tagTypes: ["Conversation", "Messages", "Unread"],
  endpoints: (build) => ({
    getConversations: build.query<Conversation[], GetConversationsArgs | void>({
      async queryFn(args) {
        try {
          const page = args?.page ?? 1;
          const limit = args?.limit ?? 50;
          const response = await conversationApi.getConversations(page, limit, {
            updatedAfter: args?.updatedAfter,
          });
          return { data: normalizeConversationsPayload(unwrapApiSuccess(response)) };
        } catch (error) {
          return { error: extractApiError(error) };
        }
      },
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
          const response = await conversationApi.getConversationById(
            conversationId,
          );
          const normalized = normalizeConversation(unwrapApiSuccess(response));
          if (!normalized) {
            throw new Error("Invalid conversation response");
          }
          return { data: normalized };
        } catch (error) {
          return { error: extractApiError(error) };
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
          return { error: extractApiError(error) };
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

    sendMessage: build.mutation<Message, SendMessageInput>({
      async queryFn(input) {
        try {
          const response = await messageApi.sendMessage(input.conversationId, {
            content: input.content,
            type: input.type,
            replyToId: input.replyToId,
            senderName: input.senderName,
            senderAvatar: input.senderAvatar,
            clientMessageId: input.clientMessageId,
            tempId: input.localId,
            localId: input.localId,
            attachments: input.attachments,
          });
          return { data: unwrapApiSuccess(response) };
        } catch (error) {
          return { error: extractApiError(error) };
        }
      },
      async onQueryStarted(input, { dispatch, queryFulfilled }) {
        const queryArg = getMessageQueryArgForConversation(input.conversationId);
        dispatch(
          chatApi.util.updateQueryData("getMessages", queryArg, (draft) => {
            upsertMessageInCache(draft, buildOptimisticMessage(input));
          }),
        );

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
        } catch (error) {
          dispatch(
            chatApi.util.updateQueryData("getMessages", queryArg, (draft) => {
              markMessageFailedInCache(
                draft,
                input.clientMessageId,
                extractApiError(error).message,
              );
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
          return { error: extractApiError(error) };
        }
      },
      async onQueryStarted(input, { dispatch, queryFulfilled }) {
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
          // The mutation error is surfaced by RTK Query; no cache patch is safe here.
        }
      },
    }),

    deleteMessage: build.mutation<void, DeleteMessageInput>({
      async queryFn(input) {
        try {
          await messageApi.deleteMessage(input.messageId);
          return { data: undefined };
        } catch (error) {
          return { error: extractApiError(error) };
        }
      },
      async onQueryStarted(input, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(
            chatApi.util.updateQueryData(
              "getMessages",
              getMessageQueryArgForConversation(input.conversationId),
              (draft) => {
                patchMessageInCache(draft, input.messageId, {
                  isDeleted: true,
                  content: "",
                });
              },
            ),
          );
        } catch {
          // The mutation error is surfaced by RTK Query; keep the current cache.
        }
      },
    }),

    markConversationRead: build.mutation<void, MarkConversationReadInput>({
      async queryFn(input) {
        try {
          await conversationApi.markAsRead(
            input.conversationId,
            input.lastVisibleMessageId,
          );
          return { data: undefined };
        } catch (error) {
          return { error: extractApiError(error) };
        }
      },
      invalidatesTags: (_result, _error, input) => [
        { type: "Unread", id: input.conversationId },
      ],
    }),

    getUnreadSummary: build.query<UnreadSummary, void>({
      async queryFn() {
        try {
          const response = await conversationApi.getUnreadSummary();
          return { data: unwrapApiSuccess(response) };
        } catch (error) {
          return { error: extractApiError(error) };
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
          return { error: extractApiError(error) };
        }
      },
    }),
  }),
});

export const {
  useDeleteMessageMutation,
  useEditMessageMutation,
  useGetConversationByIdQuery,
  useGetConversationsQuery,
  useLazyGetMessagesQuery,
  useGetMessagesQuery,
  useGetUnreadSummaryQuery,
  useMarkConversationReadMutation,
  useSearchMessagesQuery,
  useSendMessageMutation,
} = chatApi;
