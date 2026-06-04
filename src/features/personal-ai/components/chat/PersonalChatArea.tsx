import React, { useCallback, useEffect, useRef } from "react";
import clsx from "clsx";
import { SparklesIcon, BookOpenIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { PersonalMessageBubble } from "./PersonalMessageBubble";
import type { PersonalChatMessage } from "../../types";
import { usePersonalAiStore } from "../../stores/personalAiStore";

interface PersonalChatAreaProps {
  messages: PersonalChatMessage[];
  isStreaming: boolean;
  isRagMode: boolean;
  onSuggestionSelect?: (value: string) => void;
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
              "linear-gradient(135deg, #C41E3A 0%, #D32F2F 50%, #FFC857 100%)",
          }}
        >
          <SparklesIcon size={30} strokeWidth={2} className="text-white" />
        </div>
        <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-surface bg-gradient-to-br from-[#C41E3A] to-[#FFC857]">
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
              className="rounded-full border border-[#FFC857]/25 bg-[#FFC857]/6 px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-[#FFC857]/40 hover:bg-[#FFC857]/12"
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
  isRagMode,
  onSuggestionSelect,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const prevLengthRef = useRef(messages.length);
  const { activeConversationId, isSourcePanelOpen } = usePersonalAiStore();

  const hasMessages = messages.length > 0;

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 80;
  }, []);

  // Scroll to bottom when new messages are added (always) or streaming ends while near bottom.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const lengthChanged = prevLengthRef.current !== messages.length;
    prevLengthRef.current = messages.length;
    if (lengthChanged) {
      // New message added — always scroll, reset the "detached" flag.
      isAtBottomRef.current = true;
      el.scrollTop = el.scrollHeight;
    } else if (isAtBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length, isStreaming]);

  // Scroll to bottom on conversation switch
  useEffect(() => {
    isAtBottomRef.current = true;
    prevLengthRef.current = messages.length;
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [activeConversationId]);

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
        <AnimatePresence initial={false}>
          {messages.map((message, idx) => (
            <PersonalMessageBubble
              key={message.id}
              message={message}
              isLast={idx === messages.length - 1}
            />
          ))}
        </AnimatePresence>

        {/* Loading ghost when waiting for first token */}
        {isStreaming &&
          messages.length > 0 &&
          messages[messages.length - 1].role === "user" && (
            <div className="w-full bg-surface-overlay/40">
              <div className={clsx(
                    "mx-auto w-full px-4 py-5 transition-[max-width] duration-300 ease-out",
                    isSourcePanelOpen ? "max-w-[640px]" : "max-w-[960px]",
                  )}>
                <div className="flex gap-3.5">
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                    style={{
                      background:
                        "linear-gradient(135deg, #C41E3A 0%, #D32F2F 60%, #FFC857 100%)",
                    }}
                  >
                    <SparklesIcon
                      size={15}
                      strokeWidth={2.5}
                      className="text-white"
                    />
                  </div>
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
