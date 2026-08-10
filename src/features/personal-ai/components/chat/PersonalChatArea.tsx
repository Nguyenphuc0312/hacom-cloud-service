import React, { useCallback, useEffect, useRef } from "react";
import clsx from "clsx";
import { SparklesIcon, BookOpenIcon } from "lucide-react";
import { motion } from "framer-motion";
import { useVirtualizer } from "@tanstack/react-virtual";
import { PersonalMessageBubble } from "./PersonalMessageBubble";
import {
  AiMessageAvatar,
  AI_MESSAGE_ROW_PADDING,
} from "../../../ai-assistant/components/AiMessageAvatar";
import type { PersonalChatMessage } from "../../types";
import { usePersonalAiStore } from "../../stores/personalAiStore";

interface PersonalChatAreaProps {
  messages: PersonalChatMessage[];
  isStreaming: boolean;
  isLoadingHistory?: boolean;
  isRagMode: boolean;
  onSuggestionSelect?: (value: string) => void;
  /** Còn lịch sử cũ hơn ở server (§5). */
  hasOlderHistory?: boolean;
  /** Đang tải trang cũ hơn. */
  isLoadingOlder?: boolean;
  /** Cuộn gần đỉnh → gọi để tải trang cũ hơn. */
  onLoadOlder?: () => void;
}

const EmptyState: React.FC<{
  isRagMode: boolean;
  onSuggestionSelect?: (value: string) => void;
}> = ({ isRagMode, onSuggestionSelect }) => (
  <div className="flex flex-1 items-center justify-center px-6">
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex w-full max-w-[520px] flex-col items-center gap-6 text-center"
    >
      {/* Animated logo */}
      <div className="relative">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-3xl shadow-lg"
          style={{
            background:
              "linear-gradient(135deg, #1565C0 0%, #1976D2 100%)",
          }}
        >
          <SparklesIcon size={30} strokeWidth={2} className="text-white" />
        </div>
        <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-surface bg-gradient-to-br from-[#1565C0] to-[#1976D2]">
          <BookOpenIcon size={11} strokeWidth={2.5} className="text-white" />
        </div>
      </div>

      <div>
        <h2 className="text-xl font-bold text-text-primary">
          Trợ lý ảo cá nhân
        </h2>
        <p className="mt-2 max-w-[360px] text-sm leading-relaxed text-text-muted">
          {isRagMode
            ? "Tài liệu của bạn đã được nạp. Hãy đặt câu hỏi và AI sẽ trả lời dựa trên nội dung tài liệu."
            : "Thêm tệp PDF vào Sources để AI có thể trả lời dựa trên tài liệu của bạn, hoặc đặt câu hỏi thông thường."}
        </p>
      </div>

      {/* Suggestion chips */}
      {isRagMode && (
        <div className="flex flex-wrap justify-center gap-2">
          {[
            "Tóm tắt nội dung chính",
            "Các điểm quan trọng",
            "Giải thích chi tiết hơn",
            "So sánh các phần",
          ].map((s) => (
            <button
              type="button"
              key={s}
              onClick={() => onSuggestionSelect?.(s)}
              className="rounded-full border border-[#1976D2]/25 bg-[#1976D2]/6 px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-[#1976D2]/40 hover:bg-[#1976D2]/12"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </motion.div>
  </div>
);

export const PersonalChatArea: React.FC<PersonalChatAreaProps> = ({
  messages,
  isStreaming,
  isLoadingHistory = false,
  isRagMode,
  onSuggestionSelect,
  hasOlderHistory = false,
  isLoadingOlder = false,
  onLoadOlder,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const prevLengthRef = useRef(messages.length);
  /** `scrollHeight - scrollTop` ngay trước khi prepend lịch sử cũ (để bù vị trí). */
  const prependAnchorRef = useRef<number | null>(null);
  // Selector cụ thể, KHÔNG `usePersonalAiStore()` trần: gọi trần là đăng ký
  // toàn bộ store, nên mỗi frame streaming lại render component này một lần —
  // đúng thứ virtualization đang tìm cách tránh.
  const activeConversationId = usePersonalAiStore((s) => s.activeConversationId);

  const hasMessages = messages.length > 0;

  const rowVirtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => containerRef.current,
    // Ước lượng ban đầu; chiều cao thật do `measureElement` ghi đè sau khi mount.
    estimateSize: () => 140,
    // Giữ vài dòng ngoài tầm nhìn để cuộn nhanh không thấy khoảng trắng.
    overscan: 6,
    getItemKey: (index) => messages[index].id,
  });

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 80;
    // Cuộn gần đỉnh → tải trang lịch sử cũ hơn. Ghi lại chiều cao trước khi
    // prepend để bù scrollTop, giữ nguyên message người dùng đang đọc (§4.6).
    if (el.scrollTop < 200 && hasOlderHistory && !isLoadingOlder) {
      prependAnchorRef.current = el.scrollHeight - el.scrollTop;
      onLoadOlder?.();
    }
  }, [hasOlderHistory, isLoadingOlder, onLoadOlder]);

  /**
   * Bám đáy trong danh sách ảo. KHÔNG dùng `scrollTop = scrollHeight`: lúc này
   * chiều cao tổng chỉ là ƯỚC LƯỢNG, các dòng mới đo xong sẽ làm nó đổi, nên
   * đặt scrollTop bằng tay là nhảy sai chỗ. `scrollToIndex` để virtualizer tự
   * bù sau khi đo.
   */
  const scrollToBottom = useCallback(() => {
    if (messages.length === 0) return;
    rowVirtualizer.scrollToIndex(messages.length - 1, { align: "end" });
  }, [rowVirtualizer, messages.length]);

  // Bám đáy khi tin nhắn cuối DÀI RA từng frame streaming. `messages.length`
  // không đổi trong lúc stream nên phải theo cả độ dài nội dung, nếu không câu
  // trả lời chạy khuất dưới đáy màn hình.
  const lastContentLength = messages[messages.length - 1]?.content.length ?? 0;

  // Tin nhắn mới → luôn bám đáy; đang stream mà người dùng đứng gần đáy → bám theo.
  useEffect(() => {
    const el = containerRef.current;
    const lengthChanged = prevLengthRef.current !== messages.length;
    prevLengthRef.current = messages.length;

    // Vừa prepend lịch sử cũ → bù scrollTop, KHÔNG nhảy xuống đáy. Nhánh này
    // phải đứng trước vì `messages.length` cũng đổi khi prepend.
    const anchor = prependAnchorRef.current;
    if (anchor !== null) {
      prependAnchorRef.current = null;
      if (el) el.scrollTop = el.scrollHeight - anchor;
      return;
    }

    if (lengthChanged) {
      // Có tin nhắn mới — luôn cuộn, bỏ cờ "đang đọc lịch sử".
      isAtBottomRef.current = true;
      scrollToBottom();
    } else if (isAtBottomRef.current) {
      scrollToBottom();
    }
  }, [messages.length, lastContentLength, isStreaming, scrollToBottom]);

  // Scroll to bottom on conversation switch
  useEffect(() => {
    isAtBottomRef.current = true;
    prevLengthRef.current = messages.length;
    scrollToBottom();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId]);

  if (!hasMessages && isLoadingHistory) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-[#1976D2]" />
          <p className="text-sm text-text-muted">Đang tải lịch sử...</p>
        </div>
      </div>
    );
  }

  if (!hasMessages) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <EmptyState
          isRagMode={isRagMode}
          onSuggestionSelect={onSuggestionSelect}
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto ai-scrollbar"
    >
      <div className="flex flex-col py-4">
        {isLoadingOlder && (
          <div className="flex items-center justify-center gap-2 py-3 text-xs text-text-muted">
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-border border-t-[#1976D2]" />
            Đang tải lịch sử cũ hơn...
          </div>
        )}
        {/* Virtual list: chỉ mount message trong tầm nhìn + overscan. Chiều cao
            đo thật qua `measureElement` vì bảng báo cáo cao rất khác nhau. */}
        <div
          className="relative w-full"
          style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => (
            <div
              key={messages[virtualRow.index].id}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              className="absolute left-0 top-0 w-full"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <PersonalMessageBubble message={messages[virtualRow.index]} />
            </div>
          ))}
        </div>

        {/* Loading ghost when waiting for first token */}
        {isStreaming &&
          messages.length > 0 &&
          messages[messages.length - 1].role === "user" && (
            <div className="w-full bg-surface">
              <div className={clsx("w-full", AI_MESSAGE_ROW_PADDING)}>
                <div className="flex gap-3.5">
                  <AiMessageAvatar role="assistant" />
                  <div className="flex flex-col gap-1">
                    <span className="mb-1 text-xs font-semibold text-text-muted">
                      Trợ lý ảo cá nhân
                    </span>
                    <div className="flex items-center gap-1.5 py-1">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="h-2 w-2 rounded-full bg-text-muted animate-bounce"
                          style={{
                            animationDelay: `${i * 0.15}s`,
                            animationDuration: "1s",
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

        <div ref={bottomRef} className="h-4" aria-hidden="true" />
      </div>
    </div>
  );
};
