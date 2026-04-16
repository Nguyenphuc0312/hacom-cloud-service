import React from "react";
import { useTranslation } from "react-i18next";
import { fileApi } from "../services/api";
import { UPLOAD_CONFIG } from "../config";
import { toast } from "../components/ui";
import { extractApiError, unwrapApiSuccess } from "../lib/apiContract";
import { FileType, type SendMessageResult } from "../types";

export type AttachmentPickerMode = "photo" | "document";

interface UseSendMessageOptions {
  conversationId?: string;
  disabled?: boolean;
  onSend: (
    content?: string,
    fileMeta?: unknown,
    type?: string,
  ) => unknown | Promise<unknown>;
}

interface UseSendMessageResult {
  selectedFile: File | null;
  previewUrl: string | null;
  uploadProgress: number;
  uploadError: string | null;
  isUploading: boolean;
  isSending: boolean;
  selectFile: (file: File) => boolean;
  sendTextMessage: (
    content: string,
  ) => Promise<"optimistic" | "queued" | "failed">;
  sendAttachmentMessage: () => Promise<"sent" | "queued" | "failed">;
  clearSelectedFile: () => void;
  cancelUpload: () => void;
  openFilePicker: (
    mode: AttachmentPickerMode,
    input: HTMLInputElement | null,
  ) => void;
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

const resolveDisposition = (
  result: unknown,
): "optimistic" | "sent" | "queued" => {
  const candidate = result as SendMessageResult | undefined;
  if (candidate?.disposition === "optimistic") return "optimistic";
  return candidate?.disposition === "queued" ? "queued" : "sent";
};

export const useSendMessage = ({
  conversationId,
  disabled = false,
  onSend,
}: UseSendMessageOptions): UseSendMessageResult => {
  const { t } = useTranslation();
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const [isSending, setIsSending] = React.useState(false);
  const uploadAbortRef = React.useRef<AbortController | null>(null);

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

  const sendTextMessage = React.useCallback(
    async (content: string) => {
      const text = content.trim();
      if (!text || disabled) return "failed";

      try {
        const sendResult = onSend(text);
        if (
          sendResult &&
          typeof sendResult === "object" &&
          "then" in sendResult &&
          typeof sendResult.then === "function"
        ) {
          void Promise.resolve(sendResult).catch(() => {
            // Message-level failed state is handled in the timeline.
          });
          return "optimistic";
        }

        return resolveDisposition(sendResult) === "queued"
          ? "queued"
          : "optimistic";
      } catch (error) {
        const apiError = extractApiError(error);
        toast.error(apiError.message || t("error:chat.sendFailed"));
        return "failed";
      }
    },
    [disabled, onSend, t],
  );

  const sendAttachmentMessage = React.useCallback(async () => {
    if (
      !selectedFile ||
      !conversationId ||
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
      const response = await fileApi.uploadFile(
        conversationId,
        selectedFile,
        setUploadProgress,
        abortController.signal,
      );
      const uploaded = unwrapApiSuccess(response);
      const attachment = fileApi.toAttachment(uploaded);
      const mimeType = attachment.mimeType || selectedFile.type;
      const attachmentType = resolveFileType(mimeType);
      const messageType = attachmentType === FileType.IMAGE ? "image" : "file";

      setIsSending(true);
      const result = await Promise.resolve(
        onSend(
          attachment.fileName || selectedFile.name,
          attachment,
          messageType,
        ),
      );
      clearSelectedFile();
      return resolveDisposition(result) === "queued" ? "queued" : "sent";
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
    conversationId,
    disabled,
    isSending,
    isUploading,
    onSend,
    selectedFile,
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
  };
};

export default useSendMessage;
