import React, { useEffect, useRef, useState } from "react";
import { debounce } from "lodash";
import clsx from "clsx";
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
  isSending?: boolean;
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
  isSending = false,
  disabled = false,
  className,
}) => {
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
      return "File exceeds the allowed size limit";
    }

    if (!allowedTypes.includes(file.type)) {
      return "Unsupported file type";
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
        setUploadError("Upload canceled");
        return;
      }
      const apiError = extractApiError(error);
      setUploadError(apiError.message || "Upload failed, please try again");
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
    if (!value.trim() || disabled || isSending || uploading) return;
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
    <div className={clsx("relative bg-white border-t border-gray-200", className)}>
      {mode === "reply" && replyToMessage && (
        <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-1 h-8 bg-telegram-primary rounded-full" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-telegram-primary">
                Replying to {replyToMessage.senderName}
              </p>
              <p className="text-xs text-gray-500 truncate">{replyToMessage.content}</p>
            </div>
          </div>
          <button
            onClick={onCancelReply}
            className="p-1 hover:bg-gray-200 rounded-full transition-colors"
            aria-label="Cancel reply"
          >
            <XMarkIcon className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      )}

      {mode === "edit" && editingMessage && (
        <div className="flex items-center justify-between px-4 py-2 bg-yellow-50 border-b border-yellow-200">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-1 h-8 bg-yellow-500 rounded-full" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-yellow-700">Editing message</p>
              <p className="text-xs text-yellow-600 truncate">{editingMessage.content}</p>
            </div>
          </div>
          <button
            onClick={onCancelEdit}
            className="p-1 hover:bg-yellow-100 rounded-full transition-colors"
            aria-label="Cancel edit"
          >
            <XMarkIcon className="w-4 h-4 text-yellow-600" />
          </button>
        </div>
      )}

      {fileToSend && (
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200">
          {filePreview && fileToSend.type.startsWith("image/") ? (
            <img src={filePreview} alt="preview" className="w-12 h-12 object-cover rounded" />
          ) : (
            <span className="text-xs">{fileToSend.name}</span>
          )}

          {uploading ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Uploading...</span>
              <progress value={uploadProgress} max={100} className="w-24" />
              <button
                type="button"
                onClick={handleCancelUpload}
                className="text-xs text-gray-500 underline hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
          ) : uploadError ? (
            <button
              type="button"
              onClick={handleUploadAndSend}
              className="text-red-500 text-xs underline"
            >
              Retry
            </button>
          ) : (
            <button
              onClick={handleUploadAndSend}
              className="text-telegram-primary text-xs underline"
            >
              Send file
            </button>
          )}

          <button
            type="button"
            onClick={handleRemoveSelectedFile}
            className="ml-auto p-1"
            aria-label="Remove file"
          >
            <XMarkIcon className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2 px-4 py-2 pb-[max(env(safe-area-inset-bottom),0px)]">
        <div className="relative">
          <button
            onClick={() => {
              setShowEmojiPicker((prev) => !prev);
              setShowAttachmentMenu(false);
            }}
            className={clsx(
              "inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors",
              showEmojiPicker
                ? "bg-telegram-primary text-white"
                : "text-gray-500 hover:bg-gray-100",
            )}
            aria-label="Open emoji picker"
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
            onClick={() => {
              setShowAttachmentMenu((prev) => !prev);
              setShowEmojiPicker(false);
            }}
            className={clsx(
              "inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors",
              showAttachmentMenu
                ? "bg-telegram-primary text-white"
                : "text-gray-500 hover:bg-gray-100",
            )}
            aria-label="Attach file"
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
                    handleFileInput(event as unknown as React.ChangeEvent<HTMLInputElement>);
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
            placeholder="Type a message..."
            disabled={disabled}
            rows={1}
            className={clsx(
              "w-full rounded-2xl px-4 py-2",
              "bg-gray-100 border-none",
              "text-gray-900 placeholder-gray-500",
              "focus:outline-none focus:ring-2 focus:ring-telegram-primary focus:bg-white",
              "resize-none overflow-hidden",
              "transition-all duration-200",
              disabled && "opacity-50 cursor-not-allowed",
            )}
            style={{ minHeight: "40px", maxHeight: "144px" }}
            aria-label="Message input"
          />
        </div>

        {hasContent ? (
          <button
            onClick={handleSendText}
            disabled={disabled || uploading || isSending}
            className={clsx(
              "inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors",
              "bg-telegram-primary text-white",
              "hover:bg-telegram-secondary",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
            aria-label="Send message"
          >
            {isSending ? (
              <span
                className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white"
                aria-hidden="true"
              />
            ) : (
              <PaperAirplaneIcon className="h-5 w-5" />
            )}
          </button>
        ) : (
          <button
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Record voice message"
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

