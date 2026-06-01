import React, { useEffect, useRef, useState } from "react";
import {
  SparklesIcon,
  AlertCircleIcon,
  CopyIcon,
  RotateCcwIcon,
  CheckIcon,
  ThumbsUpIcon,
  ThumbsDownIcon,
  UserIcon,
} from "lucide-react";
import clsx from "clsx";
import type { AiMessage } from "../types";
import { useChatUiStore } from "../../chat/state/chatUiStore";
import { AiAnswerContent } from "./AiAnswerContent";
import { AiSourceList } from "./AiSourceList";
import { WorkReportForm } from "./WorkReportForm";
import { DepartmentSelector } from "./DepartmentSelector";
import "../styles/ai-animations.css";

interface AiChatPreviewProps {
  messages: AiMessage[];
  isLoading?: boolean;
  onUpdateMessage?: (messageId: string, patch: Partial<AiMessage>) => void;
}

const ThinkingBlock: React.FC<{ content: string }> = ({ content }) => {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="mb-3">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-xs text-text-muted hover:text-text-secondary transition-colors mb-1"
      >
        <div className="flex gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-text-muted animate-dot-bounce" style={{ animationDelay: "0s" }} />
          <span className="h-1.5 w-1.5 rounded-full bg-text-muted animate-dot-bounce" style={{ animationDelay: "0.2s" }} />
          <span className="h-1.5 w-1.5 rounded-full bg-text-muted animate-dot-bounce" style={{ animationDelay: "0.4s" }} />
        </div>
        <span className="font-medium">Đang suy nghĩ...</span>
      </button>
      {isOpen && content && (
        <div className="pl-4 border-l-2 border-border text-sm text-text-muted italic leading-relaxed">
          {content}
        </div>
      )}
    </div>
  );
};

/**
 * Danh sách tin nhắn AI – user messages căn phải, AI messages căn trái.
 * Citation [N] trong answer được render thành link chip.
 * Nguồn tham khảo hiển thị inline bên dưới mỗi câu trả lời.
 */
export const AiChatPreview: React.FC<AiChatPreviewProps> = ({
  messages,
  isLoading = false,
  onUpdateMessage,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const { selectedEndpoint } = useChatUiStore();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleCopy = (message: AiMessage) => {
    navigator.clipboard.writeText(message.content);
    setCopiedId(message.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="flex w-full flex-col gap-0 py-4">
      {messages.map((message, index) => (
        <div
          key={message.id}
          className={clsx(
            "group w-full animate-fade-in-up",
            message.role === "user" ? "bg-surface" : "bg-surface-overlay/50",
          )}
        >
          <div className="max-w-[768px] mx-auto px-4 py-6">
            <div
              className={clsx(
                "flex gap-4",
                message.role === "user" ? "flex-row-reverse" : "flex-row",
              )}
            >
              {/* Avatar */}
              <div
                className={clsx(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full mt-0.5",
                  message.role === "assistant"
                    ? message.isError
                      ? "bg-danger/10 text-danger"
                      : "text-white"
                    : "text-white",
                )}
                style={
                  message.role === "assistant" && !message.isError
                    ? { background: "linear-gradient(135deg, #1565C0 0%, #1976D2 100%)" }
                    : message.role === "user"
                      ? { background: "rgba(196,30,58,0.75)" }
                      : undefined
                }
              >
                {message.role === "assistant" ? (
                  message.isError ? (
                    <AlertCircleIcon size={16} />
                  ) : (
                    <SparklesIcon size={16} strokeWidth={2.5} />
                  )
                ) : (
                  <UserIcon size={16} strokeWidth={2.5} />
                )}
              </div>

              {/* Content */}
              <div
                className={clsx(
                  "flex flex-col gap-1 min-w-0 flex-1",
                  message.role === "user" ? "items-end" : "items-start",
                )}
              >
                {/* Label */}
                <span className="text-xs font-semibold text-text-muted mb-1">
                  {message.role === "user"
                    ? "Bạn"
                    : selectedEndpoint === "company"
                      ? "Hacom AI"
                      : "Trợ lý ảo cá nhân"}
                </span>

                {/* Thinking */}
                {message.thinking && message.role === "assistant" && (
                  <ThinkingBlock content={message.thinking} />
                )}

                {/* Message body */}
                <div
                  className={clsx(
                    message.role === "user"
                      ? "w-fit max-w-[75%] max-sm:max-w-[88%] bg-surface-hover rounded-2xl rounded-tr-sm px-5 py-3.5 text-text-primary break-words"
                      : "w-full max-w-full",
                  )}
                >
                  {message.role === "assistant" &&
                  message.isStreaming &&
                  !message.content &&
                  !message.thinking ? (
                    /* Loading dots */
                    <div className="flex items-center gap-1.5 py-1">
                      <span className="h-2 w-2 rounded-full bg-text-muted animate-bounce [animation-duration:1s]" />
                      <span className="h-2 w-2 rounded-full bg-text-muted animate-bounce [animation-duration:1s] [animation-delay:0.15s]" />
                      <span className="h-2 w-2 rounded-full bg-text-muted animate-bounce [animation-duration:1s] [animation-delay:0.3s]" />
                    </div>
                  ) : message.formRequest ? (
                    <WorkReportForm
                      data={message.formRequest}
                      onSuccess={(msg) =>
                        onUpdateMessage?.(message.id, {
                          content: msg,
                          formRequest: undefined,
                          isStreaming: false,
                        })
                      }
                      onCancel={() =>
                        onUpdateMessage?.(message.id, {
                          content: "Đã hủy báo cáo.",
                          formRequest: undefined,
                          isStreaming: false,
                        })
                      }
                    />
                  ) : message.selectionRequest ? (
                    <DepartmentSelector
                      data={message.selectionRequest}
                      onCancel={() =>
                        onUpdateMessage?.(message.id, {
                          content: "Đã hủy.",
                          selectionRequest: undefined,
                          isStreaming: false,
                        })
                      }
                    />
                  ) : message.role === "assistant" ? (
                    <AiAnswerContent
                      content={message.content}
                      sources={message.isStreaming ? undefined : message.sources}
                      isStreaming={message.isStreaming}
                    />
                  ) : (
                    <div className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
                      {message.content}
                    </div>
                  )}
                </div>

                {/* Actions bar – chỉ hiện khi hover (AI messages) */}
                {!message.isStreaming && message.role === "assistant" && (
                  <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleCopy(message)}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-text-muted hover:text-text-secondary hover:bg-surface-hover transition-colors"
                      title="Sao chép"
                    >
                      {copiedId === message.id ? (
                        <CheckIcon size={14} className="text-green-600" />
                      ) : (
                        <CopyIcon size={14} />
                      )}
                    </button>
                    <button
                      className="flex items-center p-1 rounded-md text-text-muted hover:text-text-secondary hover:bg-surface-hover transition-colors"
                      title="Thích"
                    >
                      <ThumbsUpIcon size={14} />
                    </button>
                    <button
                      className="flex items-center p-1 rounded-md text-text-muted hover:text-text-secondary hover:bg-surface-hover transition-colors"
                      title="Không thích"
                    >
                      <ThumbsDownIcon size={14} />
                    </button>
                    {index === messages.length - 1 && (
                      <button
                        className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-text-muted hover:text-text-secondary hover:bg-surface-hover transition-colors"
                        title="Tạo lại"
                      >
                        <RotateCcwIcon size={14} />
                      </button>
                    )}
                  </div>
                )}

                {/* Nguồn tham khảo – inline dưới answer */}
                {message.role === "assistant" &&
                  !message.isStreaming &&
                  message.sources &&
                  message.sources.length > 0 && (
                    <div className="w-full max-w-[680px]">
                      <AiSourceList sources={message.sources} />
                    </div>
                  )}
              </div>
            </div>
          </div>
        </div>
      ))}

      {/* Loading ghost – khi đang chờ AI response */}
      {isLoading &&
        messages.length > 0 &&
        messages[messages.length - 1].role === "user" && (
          <div className="w-full bg-surface-overlay/50">
            <div className="max-w-[768px] mx-auto px-4 py-6">
              <div className="flex gap-4">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white mt-0.5"
                  style={{ background: "linear-gradient(135deg, #1565C0 0%, #1976D2 100%)" }}
                >
                  <SparklesIcon size={16} strokeWidth={2.5} />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-text-muted mb-1">
                    {selectedEndpoint === "company" ? "Hacom AI" : "Trợ lý ảo cá nhân"}
                  </span>
                  <div className="flex items-center gap-1.5 py-1">
                    <span className="h-2 w-2 rounded-full bg-text-muted animate-dot-bounce" style={{ animationDelay: "0s" }} />
                    <span className="h-2 w-2 rounded-full bg-text-muted animate-dot-bounce" style={{ animationDelay: "0.2s" }} />
                    <span className="h-2 w-2 rounded-full bg-text-muted animate-dot-bounce" style={{ animationDelay: "0.4s" }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      <div ref={bottomRef} className="h-4" aria-hidden="true" />
    </div>
  );
};
