import React, { useState } from "react";
import { CopyIcon, CheckIcon } from "lucide-react";
import clsx from "clsx";
import type { AiMessage } from "../types";
import {
  AiMessageAvatar,
  AI_MESSAGE_ROW_PADDING,
  AI_ANSWER_MAX_WIDTH,
} from "./AiMessageAvatar";
import { AiAnswerContent } from "./AiAnswerContent";
import { AiSourceList } from "./AiSourceList";
import { WorkReportForm } from "./WorkReportForm";
import { DepartmentSelector } from "./DepartmentSelector";

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

export interface AiMessageRowProps {
  message: AiMessage;
  /** Nhãn phía trên câu trả lời ("Hacom AI" / "Trợ lý ảo cá nhân"). */
  assistantLabel: string;
  onUpdateMessage?: (messageId: string, patch: Partial<AiMessage>) => void;
}

const AiMessageRowImpl: React.FC<AiMessageRowProps> = ({
  message,
  assistantLabel,
  onUpdateMessage,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group w-full animate-fade-in-up bg-surface">
      <div className={clsx("w-full", AI_MESSAGE_ROW_PADDING)}>
        <div
          className={clsx(
            "flex gap-3.5",
            // User: avatar căn GIỮA bong bóng (không cao lêu nghêu, không
            // thấp quá). Assistant: căn đỉnh vì câu trả lời dài.
            message.role === "user"
              ? "flex-row-reverse items-center"
              : "flex-row items-start",
          )}
        >
          <AiMessageAvatar role={message.role} isError={message.isError} />

          {/* Content */}
          <div
            className={clsx(
              "flex flex-col gap-1 min-w-0 flex-1",
              message.role === "user" ? "items-end" : "items-start",
            )}
          >
            {/* Label — chỉ hiện cho assistant. User bỏ nhãn "Bạn" để bong
                bóng + avatar căn đáy gọn như bên chat. */}
            {message.role === "assistant" && (
              <span className="text-xs font-semibold text-text-muted mb-1">
                {assistantLabel}
              </span>
            )}

            {/* Thinking */}
            {message.thinking && message.role === "assistant" && (
              <ThinkingBlock content={message.thinking} />
            )}

            {/* Message body */}
            <div
              className={clsx(
                message.role === "user"
                  ? "w-fit max-w-[75%] max-sm:max-w-[88%] bg-surface-hover rounded-2xl rounded-tr-sm px-5 py-3.5 text-text-primary break-words text-justify"
                  : clsx("w-full", AI_ANSWER_MAX_WIDTH),
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
                <div className="text-[12px] leading-[1.4] whitespace-pre-wrap break-words text-justify">
                  {message.content}
                </div>
              )}
            </div>

            {/* Actions bar – chỉ hiện khi hover (AI messages) */}
            {!message.isStreaming && message.role === "assistant" && (
              <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-text-muted hover:text-text-secondary hover:bg-surface-hover transition-colors"
                  title="Sao chép"
                >
                  {copied ? (
                    <CheckIcon size={14} className="text-green-600" />
                  ) : (
                    <CopyIcon size={14} />
                  )}
                </button>
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
  );
};

/**
 * Một dòng tin nhắn. memo theo giá trị của `message` chứ không theo reference:
 * store tạo object mới cho message đang stream mỗi frame, nhưng các message cũ
 * giữ nguyên reference — so sánh field ở đây để chặn re-parse Markdown của toàn
 * bộ lịch sử ở mỗi frame streaming.
 */
export const AiMessageRow = React.memo(
  AiMessageRowImpl,
  (prev, next) =>
    prev.assistantLabel === next.assistantLabel &&
    prev.onUpdateMessage === next.onUpdateMessage &&
    prev.message.id === next.message.id &&
    prev.message.content === next.message.content &&
    prev.message.isStreaming === next.message.isStreaming &&
    prev.message.isError === next.message.isError &&
    prev.message.thinking === next.message.thinking &&
    prev.message.sources === next.message.sources &&
    prev.message.formRequest === next.message.formRequest &&
    prev.message.selectionRequest === next.message.selectionRequest,
);
