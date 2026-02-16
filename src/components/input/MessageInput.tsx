import React, { useState, useRef, useEffect } from "react";
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
import { toast } from "../ui";
import { useChatStore } from "../../stores";

interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  mode: InputMode;
  replyToMessage?: Message;
  editingMessage?: Message;
  onCancelReply?: () => void;
  onCancelEdit?: () => void;
  onTyping?: (isTyping: boolean) => void;
  disabled?: boolean;
  className?: string;
}

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
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [fileToSend, setFileToSend] = useState<File | null>(null);
  const sendMessage = useChatStore((s) => s.sendMessage);

  // Validate file
  const validateFile = (file: File): string | null => {
    const maxSize = 20 * 1024 * 1024; // 20MB
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "video/mp4",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/zip",
    ];
    if (file.size > maxSize) return "File vượt quá 20MB";
    if (!allowedTypes.includes(file.type)) return "Định dạng file không hỗ trợ";
    return null;
  };

  // Handle file select
  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateFile(file);
    if (err) {
      toast.error(err);
      return;
    }
    setFileToSend(file);
    setFilePreview(URL.createObjectURL(file));
    setUploadError(null);
    setUploadProgress(0);
  };

  // Upload file & gửi message
  const handleUploadAndSend = async () => {
    if (!fileToSend) return;
    setUploading(true);
    setUploadError(null);
    setUploadProgress(0);
    try {
      const res = await fileApi.uploadFile(fileToSend, setUploadProgress);
      // Chỉ gửi message khi upload thành công
      await sendMessage(
        // conversationId,
        res.data.filename, // content là tên file hoặc tuỳ API
        "file", // MessageType
        undefined,
        {
          id: res.data.filename,
          type: "pdf" as FileType, // fallback, hoặc map đúng FileType
          url: res.data.url,
          fileName: res.data.filename,
          fileSize: fileToSend.size,
        },
        undefined,
      );
      setFileToSend(null);
      setFilePreview(null);
      setUploadProgress(0);
    } catch (err) {
      setUploadError("Upload thất bại, thử lại.");
      // Không gửi message nếu upload fail
    } finally {
      setUploading(false);
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const newHeight = Math.min(textareaRef.current.scrollHeight, 120);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [value]);

  // Focus input when replying or editing
  useEffect(() => {
    if ((mode === "reply" || mode === "edit") && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [mode]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim()) {
        onSend();
      }
    }

    if (e.key === "Escape") {
      if (mode === "reply" && onCancelReply) {
        onCancelReply();
      } else if (mode === "edit" && onCancelEdit) {
        onCancelEdit();
      }
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    onChange(value + emoji);
    setShowEmojiPicker(false);
    textareaRef.current?.focus();
  };

  // Typing indicator logic
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Debounce emit typing (400ms)
  const debouncedTyping = useRef(
    debounce(() => {
      if (onTyping) onTyping(true);
    }, 400),
  ).current;

  const handleInputChange = (newValue: string) => {
    onChange(newValue);
    // Chỉ emit typing khi có input và textarea focus
    if (
      onTyping &&
      textareaRef.current === document.activeElement &&
      newValue.trim()
    ) {
      debouncedTyping();
      // Clear previous timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      // Set timeout để stop typing sau 2s không nhập
      typingTimeoutRef.current = setTimeout(() => {
        onTyping(false);
      }, 2000);
    } else if (onTyping && !newValue.trim()) {
      onTyping(false);
    }
  };

  // Emit stop typing khi blur
  const handleBlur = () => {
    if (onTyping) onTyping(false);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  const hasContent = value.trim().length > 0;

  return (
    <div
      className={clsx("relative bg-white border-t border-gray-200", className)}
      onBlur={handleBlur}
    >
      {/* Reply/Edit preview */}
      {mode === "reply" && replyToMessage && (
        <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-1 h-8 bg-telegram-primary rounded-full" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-telegram-primary">
                Trả lời {replyToMessage.senderName}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {replyToMessage.content}
              </p>
            </div>
          </div>
          <button
            onClick={onCancelReply}
            className="p-1 hover:bg-gray-200 rounded-full transition-colors"
            aria-label="Hủy trả lời"
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
              <p className="text-xs font-medium text-yellow-700">
                Chỉnh sửa tin nhắn
              </p>
              <p className="text-xs text-yellow-600 truncate">
                {editingMessage.content}
              </p>
            </div>
          </div>
          <button
            onClick={onCancelEdit}
            className="p-1 hover:bg-yellow-100 rounded-full transition-colors"
            aria-label="Hủy chỉnh sửa"
          >
            <XMarkIcon className="w-4 h-4 text-yellow-600" />
          </button>
        </div>
      )}

      {/* File preview & progress */}
      {fileToSend && (
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200">
          {filePreview && fileToSend.type.startsWith("image/") ? (
            <img
              src={filePreview}
              alt="preview"
              className="w-12 h-12 object-cover rounded"
            />
          ) : (
            <span className="text-xs">{fileToSend.name}</span>
          )}
          {uploading ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Đang tải lên...</span>
              <progress value={uploadProgress} max={100} className="w-24" />
            </div>
          ) : uploadError ? (
            <button
              onClick={handleUploadAndSend}
              className="text-red-500 text-xs underline"
            >
              Thử lại
            </button>
          ) : (
            <button
              onClick={handleUploadAndSend}
              className="text-telegram-primary text-xs underline"
            >
              Gửi file
            </button>
          )}
          <button
            onClick={() => {
              setFileToSend(null);
              setFilePreview(null);
            }}
            className="ml-auto p-1"
          >
            <XMarkIcon className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      )}

      {/* Main input area */}
      <div className="flex items-end gap-2 p-3">
        {/* Emoji picker button */}
        <div className="relative">
          <button
            onClick={() => {
              setShowEmojiPicker(!showEmojiPicker);
              setShowAttachmentMenu(false);
            }}
            className={clsx(
              "p-2 rounded-full transition-colors",
              showEmojiPicker
                ? "bg-telegram-primary text-white"
                : "text-gray-500 hover:bg-gray-100",
            )}
            aria-label="Mở bảng emoji"
            disabled={disabled}
          >
            <FaceSmileIcon className="w-6 h-6" />
          </button>

          {/* Emoji picker dropdown */}
          {showEmojiPicker && (
            <EmojiPicker
              onSelect={handleEmojiSelect}
              onClose={() => setShowEmojiPicker(false)}
              className="absolute bottom-full left-0 mb-2"
            />
          )}
        </div>

        {/* Attachment button */}
        <div className="relative">
          <button
            onClick={() => {
              setShowAttachmentMenu(!showAttachmentMenu);
              setShowEmojiPicker(false);
            }}
            className={clsx(
              "p-2 rounded-full transition-colors",
              showAttachmentMenu
                ? "bg-telegram-primary text-white"
                : "text-gray-500 hover:bg-gray-100",
            )}
            aria-label="Đính kèm tệp"
            disabled={disabled}
          >
            <PaperClipIcon className="w-6 h-6" />
          </button>

          {/* Attachment menu dropdown */}
          {showAttachmentMenu && (
            <AttachmentMenu
              onSelect={(type: string) => {
                if (type === "photo" || type === "document") {
                  // Trigger file input
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept =
                    type === "photo"
                      ? "image/*,video/*"
                      : ".pdf,.doc,.docx,.xls,.xlsx,.zip";
                  input.onchange = (ev: Event) =>
                    handleFileInput(
                      ev as unknown as React.ChangeEvent<HTMLInputElement>,
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

        {/* Text input */}
        <div className="flex-1 min-w-0">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Nhập tin nhắn..."
            disabled={disabled}
            rows={1}
            className={clsx(
              "w-full px-4 py-2.5 rounded-2xl",
              "bg-gray-100 border-none",
              "text-gray-900 placeholder-gray-500",
              "focus:outline-none focus:ring-2 focus:ring-telegram-primary focus:bg-white",
              "resize-none overflow-hidden",
              "transition-all duration-200",
              disabled && "opacity-50 cursor-not-allowed",
            )}
            style={{ minHeight: "44px", maxHeight: "120px" }}
            aria-label="Ô nhập tin nhắn"
          />
        </div>

        {/* Send / Voice button */}
        {hasContent ? (
          <button
            onClick={onSend}
            disabled={disabled}
            className={clsx(
              "p-2 rounded-full transition-all",
              "bg-telegram-primary text-white",
              "hover:bg-telegram-secondary",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "animate-bounce-in",
            )}
            aria-label="Gửi tin nhắn"
          >
            <PaperAirplaneIcon className="w-6 h-6" />
          </button>
        ) : (
          <button
            className="p-2 rounded-full text-gray-500 hover:bg-gray-100 transition-colors"
            aria-label="Ghi âm tin nhắn"
            disabled={disabled}
          >
            <MicrophoneIcon className="w-6 h-6" />
          </button>
        )}
      </div>
    </div>
  );
};

export default MessageInput;
