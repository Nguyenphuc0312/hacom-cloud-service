import React, { useState, useRef, useEffect } from "react";
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

interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  mode: InputMode;
  replyToMessage?: Message;
  editingMessage?: Message;
  onCancelReply?: () => void;
  onCancelEdit?: () => void;
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
  disabled = false,
  className,
}) => {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const hasContent = value.trim().length > 0;

  return (
    <div
      className={clsx("relative bg-white border-t border-gray-200", className)}
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
                console.log("Selected attachment type:", type);
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
            onChange={(e) => onChange(e.target.value)}
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
