import React, { useEffect, useRef, useState } from "react";
import {
  SparklesIcon,
  AlertCircleIcon,
  FileTextIcon,
  ExternalLinkIcon,
  CopyIcon,
  RotateCcwIcon,
  CheckIcon,
  ThumbsUpIcon,
  ThumbsDownIcon,
  UserIcon,
} from "lucide-react";
import clsx from "clsx";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import type { AiMessage, AiChatSource } from "../types";
import { useAiAssistantStore } from "../state/aiAssistantStore";
import { useChatUiStore } from "../../chat/state/chatUiStore";
import "../styles/ai-animations.css";

interface AiChatPreviewProps {
  messages: AiMessage[];
  isLoading?: boolean;
}

/**
 * Block hiển thị quá trình "suy nghĩ" của AI.
 */
const ThinkingBlock: React.FC<{ content: string }> = ({ content }) => {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="mb-3">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 transition-colors mb-1"
      >
        <div className="flex gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-dot-bounce" style={{ animationDelay: '0s' }} />
          <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-dot-bounce" style={{ animationDelay: '0.2s' }} />
          <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-dot-bounce" style={{ animationDelay: '0.4s' }} />
        </div>
        <span className="font-medium">Đang suy nghĩ...</span>
      </button>
      {isOpen && content && (
        <div className="pl-4 border-l-2 border-gray-200 text-sm text-gray-400 italic leading-relaxed">
          {content}
        </div>
      )}
    </div>
  );
};

/**
 * Danh sách tin nhắn kiểu ChatGPT – user messages căn phải nhẹ,
 * AI messages căn trái với avatar, markdown rendering, copy/feedback actions.
 */
export const AiChatPreview: React.FC<AiChatPreviewProps> = ({
  messages,
  isLoading = false,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const { setSelectedSources, toggleSourcePanel } = useAiAssistantStore();
  const { selectedEndpoint } = useChatUiStore();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  /** Mở panel source references */
  const handleSourceClick = (sources: AiChatSource[]) => {
    setSelectedSources(sources);
    toggleSourcePanel(true);
  };

  /** Copy nội dung tin nhắn */
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
            message.role === "user" ? "bg-white" : "bg-gray-50/50",
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
                      ? "bg-red-100 text-red-600"
                      : "bg-gray-900 text-white"
                    : "bg-blue-600 text-white",
                )}
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
                <span className="text-xs font-semibold text-gray-500 mb-1">
                  {message.role === "user" ? "Bạn" : (selectedEndpoint === "company" ? "Hacom AI" : "Trợ lý ảo cá nhân")}
                </span>

                {/* Thinking */}
                {message.thinking && message.role === "assistant" && (
                  <ThinkingBlock content={message.thinking} />
                )}

                {/* Message body */}
                <div
                  className={clsx(
                    "max-w-full",
                    message.role === "user"
                      ? "bg-gray-100 rounded-2xl rounded-tr-sm px-5 py-3.5 text-gray-900"
                      : "",
                  )}
                >
                  {message.role === "assistant" &&
                  message.isStreaming &&
                  !message.content &&
                  !message.thinking ? (
                    /* Loading dots */
                    <div className="flex items-center gap-1.5 py-1">
                      <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce [animation-duration:1s]" />
                      <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce [animation-duration:1s] [animation-delay:0.15s]" />
                      <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce [animation-duration:1s] [animation-delay:0.3s]" />
                    </div>
                  ) : (
                    <div
                      className={clsx(
                        message.role === "assistant"
                          ? "prose-chatgpt"
                          : "text-[15px] leading-relaxed whitespace-pre-wrap break-words",
                      )}
                    >
                      {message.role === "assistant" ? (
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          rehypePlugins={[rehypeSanitize]}
                        >
                          {message.content}
                        </ReactMarkdown>
                      ) : (
                        message.content
                      )}
                    </div>
                  )}

                  {/* Streaming cursor */}
                  {message.isStreaming && message.content && (
                    <span className="inline-block w-[3px] h-5 bg-gray-900 ml-0.5 translate-y-1 animate-typing-cursor rounded-sm" />
                  )}
                </div>

                {/* Actions bar – chỉ hiện khi hover (AI messages) */}
                {!message.isStreaming && message.role === "assistant" && (
                  <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleCopy(message)}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                      title="Sao chép"
                    >
                      {copiedId === message.id ? (
                        <CheckIcon size={14} className="text-green-600" />
                      ) : (
                        <CopyIcon size={14} />
                      )}
                    </button>
                    <button
                      className="flex items-center p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                      title="Thích"
                    >
                      <ThumbsUpIcon size={14} />
                    </button>
                    <button
                      className="flex items-center p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                      title="Không thích"
                    >
                      <ThumbsDownIcon size={14} />
                    </button>
                    {index === messages.length - 1 && (
                      <button
                        className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                        title="Tạo lại"
                      >
                        <RotateCcwIcon size={14} />
                      </button>
                    )}
                  </div>
                )}

                {/* Source references */}
                {message.role === "assistant" &&
                  message.sources &&
                  message.sources.length > 0 &&
                  !message.isStreaming && (
                    <button
                      onClick={() => handleSourceClick(message.sources!)}
                      className="flex items-center gap-2 mt-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-xs text-gray-500 hover:bg-gray-100 hover:border-gray-300 transition-all"
                    >
                      <FileTextIcon size={14} />
                      <span>
                        {message.sources.length} nguồn tham khảo
                      </span>
                      <ExternalLinkIcon size={10} />
                    </button>
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
          <div className="w-full bg-gray-50/50">
            <div className="max-w-[768px] mx-auto px-4 py-6">
              <div className="flex gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-900 text-white mt-0.5">
                  <SparklesIcon size={16} strokeWidth={2.5} />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-gray-500 mb-1">
                    {selectedEndpoint === "company" ? "Hacom AI" : "Trợ lý ảo cá nhân"}
                  </span>
                    <div className="flex items-center gap-1.5 py-1">
                      <span className="h-2 w-2 rounded-full bg-gray-400 animate-dot-bounce" style={{ animationDelay: '0s' }} />
                      <span className="h-2 w-2 rounded-full bg-gray-400 animate-dot-bounce" style={{ animationDelay: '0.2s' }} />
                      <span className="h-2 w-2 rounded-full bg-gray-400 animate-dot-bounce" style={{ animationDelay: '0.4s' }} />
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
