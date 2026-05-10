import React from "react";
import { useTranslation } from "react-i18next";
import { ErrorCode } from "@hacom/chat-shared-types/core";
import { toast } from "../../../components/ui";
import { UPLOAD_CONFIG } from "../../../config";
import { extractApiError, unwrapApiSuccess } from "../../../lib/apiContract";
import { useAuthStore, useGroupStore } from "../../../stores";
import type {
  Attachment,
  Message,
  MessageType,
} from "../../../types";
import { MessageType as MessageTypeEnum } from "../../../types";
import { logMessageDebug } from "../../../utils/messageDebug";
import {
  DOCUMENT_UPLOAD_ACCEPT,
  PHOTO_UPLOAD_ACCEPT,
  UPLOAD_INPUT_ACCEPT,
  resolveUploadFileType,
  resolveUploadMimeTypeForFile,
  validateUploadFileType,
} from "../../../utils/uploadPolicy";
import {
  useSendMessageMutation,
  type SendMessageAttachmentInput,
} from "../../api/chatApi";
import { chatApi as legacyChatApi } from "../api/chatApi";

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
  selectedFile: File | null;
  previewUrl: string | null;
  uploadProgress: number;
  uploadError: string | null;
  isUploading: boolean;
  isSending: boolean;
  selectFile: (file: File) => boolean;
  sendTextMessage: (content: string, options?: { contentFormat?: 'plain_text' | 'markdown' }) => Promise<SendDisposition>;
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
  ) => unknown | Promise<unknown>;
}

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
    type: attachment.type,
    objectKey: attachment.objectKey,
    url: attachment.url,
    downloadUrl: attachment.downloadUrl,
    expiresAt: attachment.expiresAt,
    fileName: attachment.fileName || "attachment",
    mimeType:
      attachment.mimeType ||
      resolveUploadMimeTypeForFile({
        name: attachment.fileName || "attachment",
        type: "",
      }) ||
      "",
    fileSize: attachment.fileSize ?? 0,
    width: attachment.width,
    height: attachment.height,
    duration: attachment.duration,
    thumbnailUrl: attachment.thumbnailUrl,
  }));
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
      const mimeType = resolveUploadMimeTypeForFile(file);

      if (file.size > UPLOAD_CONFIG.MAX_FILE_SIZE) {
        return t("error:upload.fileTooLarge");
      }

      if (!mimeType) {
        return t("error:upload.unsupportedType");
      }

      const validatedType = validateUploadFileType({
        fileName: file.name,
        mimeType,
      });
      if (!validatedType.ok) {
        return t(
          validatedType.code === "MIME_EXTENSION_MISMATCH"
            ? "error:upload.mimeExtensionMismatch"
            : "error:upload.unsupportedType",
        );
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
      contentFormat?: 'plain_text' | 'markdown',
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
        const clientMessageId = createClientMessageId();
        const localId = `temp-${clientMessageId}`;
        const sendPromise = sendMessageMutation({
          conversationId: selectedConversationId,
          clientMessageId,
          localId,
          content,
          contentFormat,
          type,
          replyToId: replyTo?.id,
          senderId: currentUser?.id,
          senderName:
            currentUser?.displayName ||
            currentUser?.effectiveDisplayName ||
            currentUser?.username,
          senderAvatar: currentUser?.avatar || undefined,
          attachments: toSendMessageAttachments(fileMeta),
        })
          .unwrap()
          .catch(handleSendError);

        void sendPromise.catch(() => {
          // RTKQ cache marks the optimistic row as failed; callers can still
          // inspect the ack promise if they need transport-level handling.
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
      selectedConversationId,
      sendMessageMutation,
      setSlowModeCooldown,
      source,
      t,
    ],
  );

  const sendTextMessage = React.useCallback(
    async (content: string, options?: { contentFormat?: 'plain_text' | 'markdown' }) => {
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

        const sendResult = sendMessage(text, undefined, undefined, MessageTypeEnum.TEXT, options?.contentFormat);
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
      const response = await legacyChatApi.file.uploadFile(
        resolvedConversationId,
        selectedFile,
        setUploadProgress,
        abortController.signal,
      );
      const uploaded = unwrapApiSuccess(response);
      const attachment = legacyChatApi.file.toAttachment(uploaded);
      const mimeType = attachment.mimeType || selectedFile.type;
      const attachmentType = resolveUploadFileType(mimeType);
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
