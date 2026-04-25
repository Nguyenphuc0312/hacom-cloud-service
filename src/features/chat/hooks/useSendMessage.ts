import React from "react";
import { useTranslation } from "react-i18next";
import { ErrorCode } from "@hacom/chat-shared-types/core";
import { toast } from "../../../components/ui";
import { UPLOAD_CONFIG } from "../../../config";
import { extractApiError, unwrapApiSuccess } from "../../../lib/apiContract";
import { useChatStore, useGroupStore } from "../../../stores";
import { selectConversationMessagesFromState } from "../../../stores/chatStore";
import { useAppDispatch } from "../../../store/hooks";
import type {
  Attachment,
  Message,
  MessageType,
} from "../../../types";
import { FileType, MessageType as MessageTypeEnum } from "../../../types";
import { logMessageDebug } from "../../../utils/messageDebug";
import {
  realtimeMessageReceived,
  realtimeMessageUpdated,
} from "../../realtime/realtimeMiddleware";
import { chatApi } from "../api/chatApi";

export type AttachmentPickerMode = "photo" | "document";

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
  selectedFile: File | null;
  previewUrl: string | null;
  uploadProgress: number;
  uploadError: string | null;
  isUploading: boolean;
  isSending: boolean;
  selectFile: (file: File) => boolean;
  sendTextMessage: (content: string) => Promise<SendDisposition>;
  sendAttachmentMessage: () => Promise<SendDisposition>;
  clearSelectedFile: () => void;
  cancelUpload: () => void;
  openFilePicker: (
    mode: AttachmentPickerMode,
    input: HTMLInputElement | null,
  ) => void;
  sendMessage: (
    content: string,
    replyTo?: Message,
    fileMeta?: Attachment | Attachment[] | undefined,
    type?: MessageType,
  ) => Promise<unknown>;
}

const resolveFileType = (mimeType: string): FileType => {
  if (mimeType.startsWith("image/")) return FileType.IMAGE;
  if (mimeType.startsWith("video/")) return FileType.VIDEO;
  if (mimeType.startsWith("audio/")) return FileType.AUDIO;

  if (
    mimeType === "application/zip" ||
    mimeType === "application/x-zip-compressed"
  ) {
    return FileType.ARCHIVE;
  }

  if (
    mimeType.includes("word") ||
    mimeType.includes("excel") ||
    mimeType.includes("powerpoint") ||
    mimeType === "application/pdf" ||
    mimeType === "text/plain"
  ) {
    return FileType.DOCUMENT;
  }

  return FileType.OTHER;
};

const isCanceledUploadError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: string; name?: string };
  return (
    value.code === "ERR_CANCELED" ||
    value.name === "AbortError" ||
    value.name === "CanceledError"
  );
};

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

const getMessageBridgeKey = (message: Message): string =>
  message.clientMessageId || message.stableId || message.localId || message.id;

const findOptimisticMessage = (
  beforeMessages: readonly Message[],
  afterMessages: readonly Message[],
): Message | null => {
  const beforeKeys = new Set(beforeMessages.map(getMessageBridgeKey));
  return (
    afterMessages.find((message) => !beforeKeys.has(getMessageBridgeKey(message))) ??
    null
  );
};

const findCurrentMessageForBridge = (
  messages: readonly Message[],
  optimisticMessage: Message | null,
): Message | null => {
  if (!optimisticMessage) return null;
  const optimisticKeys = new Set([
    optimisticMessage.id,
    optimisticMessage.localId,
    optimisticMessage.clientMessageId,
    optimisticMessage.stableId,
  ].filter((value): value is string => typeof value === "string" && value.length > 0));

  return (
    messages.find((message) =>
      [
        message.id,
        message.localId,
        message.clientMessageId,
        message.stableId,
      ].some((value) => typeof value === "string" && optimisticKeys.has(value)),
    ) ?? null
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
  const dispatch = useAppDispatch();
  const resolvedConversationId = conversationId ?? selectedConversationId;
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const [isSending, setIsSending] = React.useState(false);
  const uploadAbortRef = React.useRef<AbortController | null>(null);
  const setSlowModeCooldown = useGroupStore(
    (state) => state.setSlowModeCooldown,
  );
  const storeSendMessage = useChatStore((state) => state.sendMessage);

  const clearSelectedFile = React.useCallback(() => {
    setSelectedFile(null);
    setUploadError(null);
    setUploadProgress(0);
    setIsUploading(false);
    uploadAbortRef.current = null;
    setPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return null;
    });
  }, []);

  const validateFile = React.useCallback(
    (file: File): string | null => {
      const allowedTypes = [...UPLOAD_CONFIG.ALLOWED_FILE_TYPES, "video/mp4"];

      if (file.size > UPLOAD_CONFIG.MAX_FILE_SIZE) {
        return t("error:upload.fileTooLarge");
      }

      if (!allowedTypes.includes(file.type)) {
        return t("error:upload.unsupportedType");
      }

      return null;
    },
    [t],
  );

  const selectFile = React.useCallback(
    (file: File) => {
      const errorMessage = validateFile(file);
      if (errorMessage) {
        toast.error(errorMessage);
        return false;
      }

      setUploadError(null);
      setUploadProgress(0);
      setSelectedFile(file);
      setPreviewUrl((current) => {
        if (current) {
          URL.revokeObjectURL(current);
        }
        return URL.createObjectURL(file);
      });

      return true;
    },
    [validateFile],
  );

  const sendMessage = React.useCallback(
    (
      content: string,
      replyTo?: Message,
      fileMeta?: Attachment | Attachment[] | undefined,
      type: MessageType = MessageTypeEnum.TEXT,
    ) => {
      if (onSend) {
        return Promise.resolve(onSend(content, fileMeta, type));
      }

      if (!selectedConversationId) {
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
          conversationId: selectedConversationId,
          isHistoryHydrated:
            useChatStore.getState().messagesHydratedByConversation[
              selectedConversationId
            ] === true,
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
          setSlowModeCooldown(selectedConversationId, retryAfterSeconds);
        }

        throw error;
      };

      try {
        const beforeMessages = selectConversationMessagesFromState(
          useChatStore.getState(),
          selectedConversationId,
        );
        const sendPromise = Promise.resolve(
          storeSendMessage(
            selectedConversationId,
            content,
            type,
            fileMeta,
            replyTo?.id,
            replyTo,
          ),
        );
        const afterMessages = selectConversationMessagesFromState(
          useChatStore.getState(),
          selectedConversationId,
        );
        const optimisticMessage = findOptimisticMessage(
          beforeMessages,
          afterMessages,
        );

        if (optimisticMessage) {
          dispatch(
            realtimeMessageReceived({
              conversationId: selectedConversationId,
              message: optimisticMessage,
            }),
          );
        }

        void sendPromise
          .then(() => {
            const currentMessage = findCurrentMessageForBridge(
              selectConversationMessagesFromState(
                useChatStore.getState(),
                selectedConversationId,
              ),
              optimisticMessage,
            );
            if (!currentMessage) return;
            dispatch(
              realtimeMessageUpdated({
                conversationId: selectedConversationId,
                message: currentMessage,
              }),
            );
          })
          .catch(() => {
            const currentMessage = findCurrentMessageForBridge(
              selectConversationMessagesFromState(
                useChatStore.getState(),
                selectedConversationId,
              ),
              optimisticMessage,
            );
            if (!currentMessage) return;
            dispatch(
              realtimeMessageUpdated({
                conversationId: selectedConversationId,
                message: currentMessage,
              }),
            );
          });

        return sendPromise.catch(handleSendError);
      } catch (error) {
        return handleSendError(error);
      }
    },
    [
      isConversationReady,
      onSend,
      selectedConversationId,
      dispatch,
      setSlowModeCooldown,
      source,
      storeSendMessage,
      t,
    ],
  );

  const sendTextMessage = React.useCallback(
    async (content: string) => {
      const text = content.trim();
      if (!text || disabled) return "failed";

      try {
        if (onSend) {
          const sendResult = onSend(text, undefined, MessageTypeEnum.TEXT);
          if (isPromiseLike(sendResult)) {
            void Promise.resolve(sendResult).catch(() => {
              // Timeline handles eventual failure states.
            });
            return "optimistic";
          }

          return resolveDisposition(sendResult) === "queued"
            ? "queued"
            : "optimistic";
        }

        const sendResult = await sendMessage(text);
        const disposition = resolveDisposition(sendResult);
        return disposition === "sent" ? "optimistic" : disposition;
      } catch (error) {
        const apiError = extractApiError(error);
        toast.error(apiError.message || t("error:chat.sendFailed"));
        return "failed";
      }
    },
    [disabled, onSend, sendMessage, t],
  );

  const sendAttachmentMessage = React.useCallback(async () => {
    if (
      !selectedFile ||
      !resolvedConversationId ||
      disabled ||
      isUploading ||
      isSending
    ) {
      return "failed";
    }

    const abortController = new AbortController();
    uploadAbortRef.current = abortController;
    setIsUploading(true);
    setUploadError(null);
    setUploadProgress(0);

    try {
      const response = await chatApi.file.uploadFile(
        resolvedConversationId,
        selectedFile,
        setUploadProgress,
        abortController.signal,
      );
      const uploaded = unwrapApiSuccess(response);
      const attachment = chatApi.file.toAttachment(uploaded);
      const mimeType = attachment.mimeType || selectedFile.type;
      const attachmentType = resolveFileType(mimeType);
      const messageType =
        attachmentType === "image" ? MessageTypeEnum.IMAGE : MessageTypeEnum.FILE;

      setIsSending(true);
      const result = onSend
        ? await Promise.resolve(
            onSend(
              attachment.fileName || selectedFile.name,
              attachment,
              messageType,
            ),
          )
        : await sendMessage(
            attachment.fileName || selectedFile.name,
            undefined,
            attachment,
            messageType,
          );
      clearSelectedFile();
      return resolveDisposition(result);
    } catch (error) {
      if (isCanceledUploadError(error)) {
        setUploadError(t("error:upload.uploadCanceled"));
        return "failed";
      }

      const apiError = extractApiError(error);
      const errorMessage = apiError.message || t("error:upload.uploadFailed");
      setUploadError(errorMessage);
      toast.error(errorMessage);
      return "failed";
    } finally {
      uploadAbortRef.current = null;
      setIsUploading(false);
      setIsSending(false);
    }
  }, [
    clearSelectedFile,
    disabled,
    isSending,
    isUploading,
    onSend,
    resolvedConversationId,
    selectedFile,
    sendMessage,
    t,
  ]);

  const cancelUpload = React.useCallback(() => {
    uploadAbortRef.current?.abort();
  }, []);

  const openFilePicker = React.useCallback(
    (mode: AttachmentPickerMode, input: HTMLInputElement | null) => {
      if (!input) return;

      input.accept =
        mode === "photo"
          ? "image/*,video/*"
          : ".pdf,.doc,.docx,.xls,.xlsx,.zip,.txt";
      input.value = "";
      input.click();
    },
    [],
  );

  React.useEffect(() => {
    return () => {
      uploadAbortRef.current?.abort();
      uploadAbortRef.current = null;
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  return {
    selectedFile,
    previewUrl,
    uploadProgress,
    uploadError,
    isUploading,
    isSending,
    selectFile,
    sendTextMessage,
    sendAttachmentMessage,
    clearSelectedFile,
    cancelUpload,
    openFilePicker,
    sendMessage,
  };
};

export default useSendMessage;
