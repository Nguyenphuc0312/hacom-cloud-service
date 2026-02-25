import React, { useEffect, useRef, useState } from "react";
import { debounce } from "lodash";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  FaceSmileIcon,
  PaperClipIcon,
  MicrophoneIcon,
  PaperAirplaneIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { EmojiPicker } from "./EmojiPicker";
import { AttachmentMenu } from "./AttachmentMenu";
import type { Message, InputMode } from "../../types";
import { FileType } from "../../types";
import { fileApi } from "../../services/api";
import { UPLOAD_CONFIG } from "../../config";
import { toast } from "../ui";
import { extractApiError, unwrapApiSuccess } from "../../lib/apiContract";

interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (content?: string, fileMeta?: unknown, type?: string) => void;
  mode: InputMode;
  replyToMessage?: Message;
  editingMessage?: Message;
  onCancelReply?: () => void;
  onCancelEdit?: () => void;
  onTyping?: (isTyping: boolean) => void;
  disabled?: boolean;
  className?: string;
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

export const MessageInput: React.FC<MessageInputProps> = ({
  value,
  onChange,
  onSend,
  mode,
  replyToMessage,
  editingMessage,
  onCancelReply,
  onCancelEdit,
  onTyping,
  disabled = false,
  className,
}) => {
  const { t } = useTranslation();
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [fileToSend, setFileToSend] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);

  const debouncedTyping = useRef(
    debounce(() => {
      onTyping?.(true);
    }, 400),
  ).current;

  const clearSelectedFile = () => {
    if (filePreview) {
      URL.revokeObjectURL(filePreview);
    }
    setFileToSend(null);
    setFilePreview(null);
    setUploadError(null);
    setUploadProgress(0);
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

  const validateFile = (file: File): string | null => {
    const allowedTypes = [...UPLOAD_CONFIG.ALLOWED_FILE_TYPES, "video/mp4"];

    if (file.size > UPLOAD_CONFIG.MAX_FILE_SIZE) {
      return t("error:upload.fileTooLarge");
    }

    if (!allowedTypes.includes(file.type)) {
      return t("error:upload.unsupportedType");
    }

    return null;
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const error = validateFile(file);
    if (error) {
      toast.error(error);
      return;
    }

    if (filePreview) {
      URL.revokeObjectURL(filePreview);
    }

    setFileToSend(file);
    setFilePreview(URL.createObjectURL(file));
    setUploadError(null);
    setUploadProgress(0);
  };

  const handleUploadAndSend = async () => {
    if (!fileToSend) return;

    const abortController = new AbortController();
    uploadAbortRef.current = abortController;
    setUploading(true);
    setUploadError(null);
    setUploadProgress(0);

    try {
      const response = await fileApi.uploadFile(
        fileToSend,
        setUploadProgress,
        abortController.signal,
      );
      const uploadedFile = unwrapApiSuccess(response);
      const mimeType = uploadedFile.mimetype || fileToSend.type;
      const attachmentType = resolveFileType(mimeType);
      const messageType = attachmentType === FileType.IMAGE ? "image" : "file";

      const attachment = {
        id: uploadedFile.id,
        type: attachmentType,
        url: uploadedFile.url,
        fileName: uploadedFile.filename || fileToSend.name,
        fileSize: uploadedFile.size || fileToSend.size,
        mimeType,
      };

      onSend(uploadedFile.filename || fileToSend.name, attachment, messageType);
      clearSelectedFile();
    } catch (error) {
      if (isCanceledUploadError(error)) {
        setUploadError(t("error:upload.uploadCanceled"));
        return;
      }
      const apiError = extractApiError(error);
      setUploadError(apiError.message || t("error:upload.uploadFailed"));
    } finally {
      uploadAbortRef.current = null;
      setUploading(false);
    }
  };

  const handleCancelUpload = () => {
    uploadAbortRef.current?.abort();
  };

  const handleRemoveSelectedFile = () => {
    if (uploading) {
      uploadAbortRef.current?.abort();
    }
    clearSelectedFile();
  };

  const handleSendText = () => {
    if (!value.trim() || disabled || uploading) return;
    onTyping?.(false);
    onSend(value.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendText();
    }

    if (e.key === "Escape") {
      if (mode === "reply") onCancelReply?.();
      if (mode === "edit") onCancelEdit?.();
    }
  };

  const handleInputChange = (nextValue: string) => {
    onChange(nextValue);

    if (
      onTyping &&
      textareaRef.current === document.activeElement &&
      nextValue.trim()
    ) {
      debouncedTyping();

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      typingTimeoutRef.current = setTimeout(() => {
        onTyping(false);
      }, 2000);
      return;
    }

    if (onTyping && !nextValue.trim()) {
      onTyping(false);
    }
  };

  useEffect(() => {
    if (!textareaRef.current) return;

    textareaRef.current.style.height = "auto";
    const newHeight = Math.min(textareaRef.current.scrollHeight, 144);
    textareaRef.current.style.height = `${newHeight}px`;
  }, [value]);

  useEffect(() => {
    if ((mode === "reply" || mode === "edit") && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [mode]);

  useEffect(() => {
    return () => {
      debouncedTyping.cancel();

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      if (uploadAbortRef.current) {
        uploadAbortRef.current.abort();
        uploadAbortRef.current = null;
      }

      if (filePreview) {
        URL.revokeObjectURL(filePreview);
      }
    };
  }, [debouncedTyping, filePreview]);

  const hasContent = value.trim().length > 0;
  const disableComposerActions = disabled || uploading;

  return (
    <div
      className={clsx("relative bg-surface border-t border-border", className)}
    >
      {mode === "reply" && replyToMessage && (
        <div className="flex items-center justify-between px-4 py-2 bg-surface-overlay border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-1 h-8 bg-primary rounded-full" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-primary">
                {t("chat:composer.replyingTo", {
                  name: replyToMessage.senderName,
                })}
              </p>
              <p className="text-xs text-text-muted truncate">
                {replyToMessage.content}
              </p>
            </div>
          </div>
          <button
            onClick={onCancelReply}
            className="p-1 hover:bg-surface-active rounded-full transition-colors"
            aria-label={t("chat:composer.cancelReply")}
          >
            <XMarkIcon className="w-4 h-4 text-text-muted" />
          </button>
        </div>
      )}

      {mode === "edit" && editingMessage && (
        <div className="flex items-center justify-between px-4 py-2 bg-warning/15 border-b border-warning/35">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-1 h-8 bg-warning rounded-full" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-warning">
                {t("chat:composer.editing")}
              </p>
              <p className="text-xs text-warning truncate">
                {editingMessage.content}
              </p>
            </div>
          </div>
          <button
            onClick={onCancelEdit}
            className="p-1 hover:bg-warning/20 rounded-full transition-colors"
            aria-label={t("chat:composer.cancelEdit")}
          >
            <XMarkIcon className="w-4 h-4 text-warning" />
          </button>
        </div>
      )}

      {fileToSend && (
        <div className="flex items-center gap-2 px-4 py-2 bg-surface-overlay border-b border-border">
          {filePreview && fileToSend.type.startsWith("image/") ? (
            <img
              src={filePreview}
              alt={t("chat:composer.filePreviewAlt")}
              className="w-12 h-12 object-cover rounded"
            />
          ) : (
            <span className="text-xs">{fileToSend.name}</span>
          )}

          {uploading ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-muted">{t("chat:composer.uploading")}</span>
              <progress value={uploadProgress} max={100} className="w-24" />
              <button
                type="button"
                onClick={handleCancelUpload}
                className="text-xs text-text-muted underline hover:text-text-secondary"
              >
                {t("chat:composer.cancelUpload")}
              </button>
            </div>
          ) : uploadError ? (
            <button
              type="button"
              onClick={handleUploadAndSend}
              className="text-danger text-xs underline"
            >
              {t("chat:composer.retryUpload")}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleUploadAndSend}
              className="text-primary text-xs underline"
            >
              {t("chat:composer.sendFile")}
            </button>
          )}

          <button
            type="button"
            onClick={handleRemoveSelectedFile}
            className="ml-auto p-1"
            aria-label={t("chat:composer.removeFile")}
          >
            <XMarkIcon className="w-4 h-4 text-text-muted" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2 px-4 py-2 pb-[max(env(safe-area-inset-bottom),0px)]">
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowEmojiPicker((prev) => !prev);
              setShowAttachmentMenu(false);
            }}
            className={clsx(
              "inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors",
              showEmojiPicker
                ? "bg-primary text-text-inverse"
                : "text-text-muted hover:bg-surface-overlay",
            )}
            aria-label={t("chat:composer.openEmojiPicker")}
            disabled={disableComposerActions}
          >
            <FaceSmileIcon className="h-5 w-5" />
          </button>

          {showEmojiPicker && (
            <EmojiPicker
              onSelect={(emoji: string) => {
                onChange(value + emoji);
                setShowEmojiPicker(false);
                textareaRef.current?.focus();
              }}
              onClose={() => setShowEmojiPicker(false)}
              className="absolute bottom-full left-0 mb-2"
            />
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowAttachmentMenu((prev) => !prev);
              setShowEmojiPicker(false);
            }}
            className={clsx(
              "inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors",
              showAttachmentMenu
                ? "bg-primary text-text-inverse"
                : "text-text-muted hover:bg-surface-overlay",
            )}
            aria-label={t("chat:composer.attachFile")}
            disabled={disableComposerActions}
          >
            <PaperClipIcon className="h-5 w-5" />
          </button>

          {showAttachmentMenu && (
            <AttachmentMenu
              onSelect={(type: string) => {
                if (type === "photo" || type === "document") {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept =
                    type === "photo"
                      ? "image/*,video/*"
                      : ".pdf,.doc,.docx,.xls,.xlsx,.zip,.txt";
                  input.onchange = (event: Event) =>
                    handleFileInput(
                      event as unknown as React.ChangeEvent<HTMLInputElement>,
                    );
                  input.click();
                }
                setShowAttachmentMenu(false);
              }}
              onClose={() => setShowAttachmentMenu(false)}
              className="absolute bottom-full left-0 mb-2"
            />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => onTyping?.(false)}
            placeholder={t("chat:composer.placeholder")}
            disabled={disabled}
            rows={1}
            className={clsx(
              "w-full rounded-2xl px-4 py-2",
              "bg-surface-overlay border-none",
              "text-text-primary placeholder:text-text-muted",
              "focus:outline-none focus:ring-2 focus:ring-focus/30 focus:bg-surface",
              "resize-none overflow-hidden",
              "transition-all duration-200",
              disabled && "opacity-50 cursor-not-allowed",
            )}
            style={{ minHeight: "40px", maxHeight: "144px" }}
            aria-label={t("chat:composer.messageInput")}
          />
        </div>

        {hasContent ? (
          <button
            type="button"
            onClick={handleSendText}
            disabled={disabled || uploading}
            className={clsx(
              "inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors",
              "bg-primary text-text-inverse",
              "hover:bg-primary-hover",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
            aria-label={t("chat:composer.sendMessage")}
          >
            <PaperAirplaneIcon className="h-5 w-5" />
          </button>
        ) : (
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-overlay disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={t("chat:composer.recordVoice")}
            disabled={disableComposerActions}
          >
            <MicrophoneIcon className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
};

export default MessageInput;
