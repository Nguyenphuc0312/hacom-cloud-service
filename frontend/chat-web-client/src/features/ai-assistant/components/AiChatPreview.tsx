import React, { useCallback, useEffect, useRef } from "react";
import clsx from "clsx";
import type { AiMessage } from "../types";
import { useChatUiStore } from "../../chat/state/chatUiStore";
import { AiMessageAvatar, AI_MESSAGE_ROW_PADDING } from "./AiMessageAvatar";
import { AiMessageRow } from "./AiMessageRow";
import "../styles/ai-animations.css";

interface AiChatPreviewProps {
  messages: AiMessage[];
  isLoading?: boolean;
  onUpdateMessage?: (messageId: string, patch: Partial<AiMessage>) => void;
  /** When false, the component skips auto-scroll (parent owns scrolling). */
  autoScroll?: boolean;
}

/**
 * Danh sách tin nhắn AI – user messages căn phải, AI messages căn trái.
 * Citation [N] trong answer được render thành link chip.
 * Nguồn tham khảo hiển thị inline bên dưới mỗi câu trả lời.
 */
const AiChatPreviewImpl: React.FC<AiChatPreviewProps> = ({
  messages,
  isLoading = false,
  onUpdateMessage,
  autoScroll = true,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<HTMLDivElement>(null);
  const scrolledWidgetIdRef = useRef<string | null>(null);
  const selectedEndpoint = useChatUiStore((s) => s.selectedEndpoint);

  // Message cuối có đang hiển thị form/selector tương tác (#baocaocv) không?
  const lastMsg = messages[messages.length - 1];
  const widgetMessageId =
    lastMsg && (lastMsg.formRequest || lastMsg.selectionRequest)
      ? lastMsg.id
      : null;

  useEffect(() => {
    // Khi message cuối là form/selector: đưa ĐỈNH widget vào tầm nhìn ĐÚNG MỘT LẦN
    // lúc nó vừa xuất hiện. Lệnh này ghi đè animation smooth-scroll xuống đáy còn
    // chạy dở (từ lúc streaming) — chính nó là nguyên nhân khiến widget "nhảy lên"
    // khi nội dung load bất đồng bộ và cao dần. Neo theo đỉnh widget (không theo
    // bottomRef) nên nội dung load thêm bên dưới không còn gây giật.
    if (widgetMessageId) {
      if (scrolledWidgetIdRef.current !== widgetMessageId) {
        scrolledWidgetIdRef.current = widgetMessageId;
        requestAnimationFrame(() => {
          widgetRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
      return;
    }
    scrolledWidgetIdRef.current = null;
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    // Chỉ chạy khi SỐ LƯỢNG message đổi hoặc widget xuất hiện — không chạy theo
    // từng frame streaming (parent lo việc bám đáy khi stream).
  }, [messages.length, widgetMessageId, autoScroll]);

  const assistantLabel =
    selectedEndpoint === "company" ? "Hacom AI" : "Trợ lý ảo cá nhân";

  // Ổn định reference để memo của AiMessageRow không bị phá mỗi render.
  const handleUpdateMessage = useCallback(
    (messageId: string, patch: Partial<AiMessage>) =>
      onUpdateMessage?.(messageId, patch),
    [onUpdateMessage],
  );

  return (
    <div className="flex w-full flex-col gap-0 py-4">
      {messages.map((message) => (
        <div
          key={message.id}
          ref={message.id === widgetMessageId ? widgetRef : undefined}
        >
          <AiMessageRow
            message={message}
            assistantLabel={assistantLabel}
            onUpdateMessage={handleUpdateMessage}
          />
        </div>
      ))}

      {/* Loading ghost – khi đang chờ AI response */}
      {isLoading && lastMsg?.role === "user" && (
        <div className="w-full bg-surface">
          <div className={clsx("w-full", AI_MESSAGE_ROW_PADDING)}>
            <div className="flex gap-3.5">
              <AiMessageAvatar role="assistant" />
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-muted mb-1">
                  {assistantLabel}
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

export const AiChatPreview = React.memo(AiChatPreviewImpl);
