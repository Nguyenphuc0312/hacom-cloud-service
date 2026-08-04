import React from "react";
import { useTranslation } from "react-i18next";
import type { LinkPreviewMeta } from "../../../components/message/linkPreviewUtils";
import { ErrorCode } from "@hacom/chat-shared-types/core";
import { toast } from "../../../components/ui";
import { extractApiError } from "../../../lib/apiContract";
import { useAuthStore, useGroupStore } from "../../../stores";
import type { Attachment, AudioMessagePayload, LocationMessagePayload, Message, MessageType } from "../../../types";
import { MessageType as MessageTypeEnum } from "../../../types";
import { logMessageDebug } from "../../../utils/messageDebug";
import {
  DOCUMENT_UPLOAD_ACCEPT,
  PHOTO_UPLOAD_ACCEPT,
  UPLOAD_INPUT_ACCEPT,
  resolveUploadFileType,
  resolveUploadMimeTypeForFile,
} from "../../../utils/uploadPolicy";
import {
  useSendMessageMutation,
  type MentionSendInput,
  type SendMessageAttachmentInput,
} from "../../api/chatApi";

export type AttachmentPickerMode = "photo" | "document" | "mixed";

type SendDisposition = "optimistic" | "queued" | "sent" | "failed";

interface UseSendMessageOptions {
  selectedConversationId?: string | null;
  conversationId?: string;
  isConversationReady?: boolean;
  disabled?: boolean;
  onSend?: (
    content?: string,
    fileMeta?: unknown,
    type?: string,
  ) => unknown | Promise<unknown>;
  source?: string;
}

interface UseSendMessageResult {
  isSending: boolean;
  sendTextMessage: (
    content: string,
    options?: {
      contentFormat?: "plain_text" | "rich_text";
      contentJson?: Record<string, unknown>;
      plainText?: string;
      linkPreview?: LinkPreviewMeta;
    },
  ) => Promise<SendDisposition>;
  openFilePicker: (
    mode: AttachmentPickerMode,
    input: HTMLInputElement | null,
  ) => void;
  sendMessage: (
    content: string,
    replyTo?: Message,
    fileMeta?: Attachment | Attachment[] | undefined,
    type?: MessageType,
    /** Array of mention objects with userId and displayName for optimistic rendering */
    mentions?: MentionSendInput[],
    contentFormat?: "plain_text" | "rich_text",
    contentJson?: Record<string, unknown>,
    plainText?: string,
    linkPreview?: LinkPreviewMeta,
    options?: {
      location?: LocationMessagePayload;
      audio?: AudioMessagePayload;
      clientMessageId?: string;
    },
  ) => unknown | Promise<unknown>;
}

const resolveDisposition = (result: unknown): SendDisposition => {
  const candidate = result as { disposition?: unknown } | undefined;
  const disposition =
    typeof candidate?.disposition === "string"
      ? candidate.disposition
      : undefined;

  if (disposition === "acceptedOptimistic") return "optimistic";
  if (disposition === "optimistic") return "optimistic";
  if (disposition === "queued") return "queued";
  return "sent";
};

const isPromiseLike = (value: unknown): value is PromiseLike<unknown> =>
  Boolean(
    value &&
      typeof value === "object" &&
      "then" in value &&
      typeof (value as PromiseLike<unknown>).then === "function",
  );

const createClientMessageId = (): string => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const toSendMessageAttachments = (
  fileMeta: Attachment | Attachment[] | undefined,
): SendMessageAttachmentInput[] | undefined => {
  if (!fileMeta) return undefined;
  const attachments = Array.isArray(fileMeta) ? fileMeta : [fileMeta];
  return attachments.map((attachment) => ({ 
    id: attachment.id, 
    type: 
      attachment.type || 
      resolveUploadFileType( 
        attachment.mimeType ||
          resolveUploadMimeTypeForFile({
            name: attachment.fileName || "attachment",
            type: "",
          }) || 
          "", 
      ), 
    fileName: attachment.fileName || "attachment", 
    mimeType: 
      attachment.mimeType || 
      resolveUploadMimeTypeForFile({
        name: attachment.fileName || "attachment",
        type: "",
      }) ||
      "",
    fileSize: attachment.fileSize ?? 0,
    url: attachment.url,
    width: attachment.width,
    height: attachment.height,
    duration: attachment.duration,
    thumbnailUrl: attachment.thumbnailUrl,
  }));
};

const retryRequestsInFlight = new Set<string>();

const getRetryMessageKey = (message: Message): string | null =>
  message.clientMessageId ||
  message.stableId ||
  message.localId ||
  message.id ||
  null;

const getRetryReplyToId = (message: Message): string | undefined => {
  if (typeof message.replyTo === "string") return message.replyTo;
  if (typeof message.replyToMessage?.id === "string") {
    return message.replyToMessage.id;
  }
  return undefined;
};

const getRetryContentFormat = (
  message: Message,
): "plain_text" | "rich_text" | undefined =>
  message.contentFormat === "plain_text" || message.contentFormat === "rich_text"
    ? message.contentFormat
    : undefined;

export const useRetrySendMessage = () => {
  const [sendMessageMutation] = useSendMessageMutation();

  return React.useCallback(
    async (message: Message) => {
      const conversationId = message.conversationId;
      const clientMessageId = getRetryMessageKey(message);
      if (!conversationId || !clientMessageId) {
        return;
      }

      const requestKey = `${conversationId}:${clientMessageId}`;
      if (retryRequestsInFlight.has(requestKey)) {
        return;
      }

      retryRequestsInFlight.add(requestKey);
      try {
        await sendMessageMutation({
          conversationId,
          clientMessageId,
          localId: message.localId || `temp-${clientMessageId}`,
          content: message.content || "",
          contentFormat: getRetryContentFormat(message),
          contentJson: message.contentJson,
          plainText: message.plainText,
          type: message.type,
          replyToId: getRetryReplyToId(message),
          replyToMessage: message.replyToMessage as Message | undefined,
          senderId: message.senderId,
          senderName: message.senderName,
          senderAvatar: message.senderAvatar,
          mentions: message.mentions,
          attachments: toSendMessageAttachments(message.attachments),
          location: message.location,
          audio: message.audio,
        }).unwrap();
      } finally {
        retryRequestsInFlight.delete(requestKey);
      }
    },
    [sendMessageMutation],
  );
};

export const useSendMessage = ({
  selectedConversationId = null,
  conversationId,
  isConversationReady = true,
  disabled = false,
  onSend,
  source = "ChatPage",
}: UseSendMessageOptions): UseSendMessageResult => {
  const { t } = useTranslation();
  const resolvedConversationId = conversationId ?? selectedConversationId;
  const currentUser = useAuthStore((state) => state.user);
  const [sendMessageMutation] = useSendMessageMutation();
  const [isSending, setIsSending] = React.useState(false);
  const setSlowModeCooldown = useGroupStore(
    (state) => state.setSlowModeCooldown,
  );

  const sendMessage = React.useCallback(
    (
      content: string,
      replyTo?: Message,
      fileMeta?: Attachment | Attachment[] | undefined,
      type: MessageType = MessageTypeEnum.TEXT,
      /** Mentions with resolved displayName for optimistic rendering */
      mentions?: MentionSendInput[],
      contentFormat?: "plain_text" | "rich_text",
      contentJson?: Record<string, unknown>,
      plainText?: string,
      linkPreview?: LinkPreviewMeta,
      options?: {
        location?: LocationMessagePayload;
        audio?: AudioMessagePayload;
        clientMessageId?: string;
      },
    ) => {
      if (onSend) {
        return Promise.resolve(onSend(content, fileMeta, type));
      }

      if (!resolvedConversationId) {
        const error = new Error(
          t("error:chat.conversationOpenFailed", {
            defaultValue: "Conversation is not ready yet.",
          }),
        );
        logMessageDebug(source, "send_blocked_no_selected_conversation", {
          contentLength: content.trim().length,
          type,
        });
        throw error;
      }

      if (!isConversationReady) {
        const error = new Error(
          t("common:loading.default", {
            defaultValue: "Loading conversation...",
          }),
        );
        logMessageDebug(source, "send_blocked_conversation_not_ready", {
          conversationId: resolvedConversationId,
          isConversationReady,
          contentLength: content.trim().length,
          type,
        });
        throw error;
      }

      const handleSendError = (error: unknown) => {
        const apiError = extractApiError(error);
        const details =
          apiError.details && typeof apiError.details === "object"
            ? (apiError.details as Record<string, unknown>)
            : null;
        const retryAfterSeconds =
          details && typeof details.retryAfterSeconds === "number"
            ? details.retryAfterSeconds
            : null;

        if (
          (apiError.code === ErrorCode.SLOW_MODE_ACTIVE ||
            String(apiError.code).toUpperCase() === "SLOW_MODE_ACTIVE") &&
          retryAfterSeconds &&
          retryAfterSeconds > 0
        ) {
          setSlowModeCooldown(resolvedConversationId, retryAfterSeconds);
        }

        throw error;
      };

      try {
        const clientMessageId = options?.clientMessageId || createClientMessageId();
        const localId = `temp-${clientMessageId}`;
        const sendPromise = sendMessageMutation({
          conversationId: resolvedConversationId,
          clientMessageId,
          localId,
          content,
          contentFormat,
          contentJson,
          plainText,
          type,
          replyToId: replyTo?.id,
          replyToMessage: replyTo,
          senderId: currentUser?.id,
          senderName:
            currentUser?.displayName ||
            currentUser?.effectiveDisplayName ||
            currentUser?.username,
          senderAvatar: currentUser?.avatar || undefined,
          mentions: mentions?.length ? mentions : undefined,
          attachments: toSendMessageAttachments(fileMeta),
          linkPreview,
          location: options?.location,
          audio: options?.audio,
        })
          .unwrap()
          .catch(handleSendError);

        void sendPromise.catch(() => {
          // The optimistic row is already marked failed by RTKQ side-effects.
        });

        return {
          disposition: "optimistic",
          messageId: clientMessageId,
          ack: sendPromise,
        };
      } catch (error) {
        return handleSendError(error);
      }
    },
    [
      currentUser?.avatar,
      currentUser?.displayName,
      currentUser?.effectiveDisplayName,
      currentUser?.id,
      currentUser?.username,
      isConversationReady,
      onSend,
      resolvedConversationId,
      sendMessageMutation,
      setSlowModeCooldown,
      source,
      t,
    ],
  );

  const sendTextMessage = React.useCallback(
    async (
      content: string,
      options?: {
        contentFormat?: "plain_text" | "rich_text";
        contentJson?: Record<string, unknown>;
        plainText?: string;
        linkPreview?: LinkPreviewMeta;
      },
    ) => {
      const text = content.trim();
      if (!text || disabled) return "failed";

      setIsSending(true);
      try {
        if (onSend) {
          const sendResult = onSend(text, undefined, MessageTypeEnum.TEXT);
          if (isPromiseLike(sendResult)) {
            void Promise.resolve(sendResult).catch(() => undefined);
            return "optimistic";
          }

          return resolveDisposition(sendResult) === "queued"
            ? "queued"
            : "optimistic";
        }

        const sendResult = sendMessage(
          text,
          undefined,
          undefined,
          MessageTypeEnum.TEXT,
          undefined,
          options?.contentFormat,
          options?.contentJson,
          options?.plainText,
          options?.linkPreview,
          undefined,
        );
        const disposition = resolveDisposition(sendResult);
        return disposition === "sent" ? "optimistic" : disposition;
      } catch (error) {
        const apiError = extractApiError(error);
        toast.error(apiError.message || t("error:chat.sendFailed"));
        return "failed";
      } finally {
        setIsSending(false);
      }
    },
    [disabled, onSend, sendMessage, t],
  );

  const openFilePicker = React.useCallback(
    (mode: AttachmentPickerMode, input: HTMLInputElement | null) => {
      if (!input) return;

      if (mode === "photo") {
        input.accept = PHOTO_UPLOAD_ACCEPT;
      } else if (mode === "document") {
        input.accept = DOCUMENT_UPLOAD_ACCEPT;
      } else {
        input.accept = UPLOAD_INPUT_ACCEPT;
      }
      input.value = "";
      input.click();
    },
    [],
  );

  return {
    isSending,
    sendTextMessage,
    openFilePicker,
    sendMessage,
  };
};

export default useSendMessage;
