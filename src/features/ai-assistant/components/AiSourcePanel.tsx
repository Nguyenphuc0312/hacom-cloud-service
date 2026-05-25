import React, { useState, useCallback } from "react";
import {
  FileTextIcon,
  XIcon,
  ExternalLinkIcon,
  BookOpenIcon,
  RefreshCwIcon,
  AlertCircleIcon,
} from "lucide-react";
import { useAiAssistantStore } from "../state/aiAssistantStore";
import { useChatUiStore } from "../../chat/state/chatUiStore";
import { useAuthStore } from "../../../stores/authStore";
import { motion } from "framer-motion";
import type { AiSource } from "../types";
import { isSafeSourceUrl, getSourceLabel, getSourceMeta } from "../utils/sourceUtils";
import { sendAiChatMessage } from "../services/aiChatApi";

export const AiSourcePanel: React.FC = () => {
  const { conversations, activeConversationId, toggleSourcePanel, setSelectedSources } = useAiAssistantStore();
  const { selectedEndpoint } = useChatUiStore();
  const user = useAuthStore((s) => s.user);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  // Lấy sources từ tin nhắn assistant cuối cùng của cuộc hội thoại hiện tại
  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const messages = activeConversation?.messages ?? [];

  // Tìm assistant message cuối có sources
  const lastAssistantWithSources = [...messages]
    .reverse()
    .find((m) => m.role === "assistant" && m.sources && m.sources.length > 0);

  // Tìm user question trước đó
  const lastAssistantIndex = lastAssistantWithSources
    ? messages.indexOf(lastAssistantWithSources)
    : -1;
  const lastQuestion =
    lastAssistantIndex > 0 && messages[lastAssistantIndex - 1]?.role === "user"
      ? messages[lastAssistantIndex - 1].content
      : null;

  const sources: AiSource[] = lastAssistantWithSources?.sources ?? [];

  const handleRefresh = useCallback(async () => {
    if (!lastQuestion || !activeConversationId || isRefreshing) return;

    setIsRefreshing(true);
    setRefreshError(null);

    try {
      const isCompany = selectedEndpoint === "company";
      const request: Record<string, string> = {
        question: lastQuestion,
        session_id: activeConversationId,
        department: user?.departmentName ?? "",
      };

      if (isCompany) {
        request.user_id = user?.id ?? "";
        request.user_name = user?.fullNameFromHR ?? user?.displayName ?? user?.username ?? "";
      } else {
        request.employee_code = user?.employeeCode ?? user?.employee_code ?? "";
        request.employee_name = user?.fullNameFromHR ?? user?.displayName ?? user?.username ?? "";
      }

      const response = await sendAiChatMessage(request as never, selectedEndpoint);

      if (response.sources && response.sources.length > 0) {
        setSelectedSources(response.sources);

        // Cập nhật sources trong message tương ứng
        useAiAssistantStore.setState((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === activeConversationId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === lastAssistantWithSources?.id
                      ? { ...m, sources: response.sources }
                      : m,
                  ),
                }
              : c,
          ),
        }));
      } else {
        setRefreshError("Không tìm thấy nguồn tham khảo mới.");
      }
    } catch {
      setRefreshError("Không thể làm mới. Vui lòng thử lại.");
    } finally {
      setIsRefreshing(false);
    }
  }, [lastQuestion, activeConversationId, isRefreshing, selectedEndpoint, user, lastAssistantWithSources]);

  if (sources.length === 0) return null;

  return (
    <motion.div
      initial={{ x: 380, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 380, opacity: 0 }}
      transition={{ type: "spring", damping: 28, stiffness: 220 }}
      className="flex h-full w-[380px] flex-col bg-surface border-l border-border z-40 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <BookOpenIcon size={18} className="text-text-secondary" strokeWidth={2} />
          <h2 className="text-sm font-semibold text-text-primary">Nguồn tham khảo</h2>
          <span className="bg-surface-hover text-text-secondary text-[11px] px-2 py-0.5 rounded-full font-medium">
            {sources.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing || !lastQuestion}
            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-surface-hover text-text-muted hover:text-text-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Làm mới nguồn tham khảo"
            title={lastQuestion ? "Làm mới nguồn tham khảo" : "Không có câu hỏi để làm mới"}
          >
            <RefreshCwIcon
              size={16}
              strokeWidth={2}
              className={isRefreshing ? "animate-spin text-primary" : ""}
            />
          </button>
          <button
            onClick={() => toggleSourcePanel(false)}
            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-surface-hover text-text-muted hover:text-text-secondary transition-colors"
            aria-label="Đóng panel"
          >
            <XIcon size={18} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Refresh error */}
      {refreshError && (
        <div className="mx-4 mt-3 flex items-center gap-2 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
          <AlertCircleIcon size={14} strokeWidth={2} className="shrink-0" />
          {refreshError}
        </div>
      )}

      {/* Refreshing overlay hint */}
      {isRefreshing && (
        <div className="mx-4 mt-3 flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-xs text-primary">
          <RefreshCwIcon size={14} strokeWidth={2} className="animate-spin shrink-0" />
          Đang tải lại nguồn tham khảo...
        </div>
      )}

      {/* Source list */}
      <div className="flex-1 overflow-y-auto ai-scrollbar p-4 space-y-3">
        {sources.map((source, index) => {
          const label = getSourceLabel(source);
          const meta = getSourceMeta(source);
          const safe = isSafeSourceUrl(source.open_url);

          const card = (
            <div className="flex items-start gap-3 mb-2">
              <div className="h-10 w-10 shrink-0 rounded-lg bg-surface-hover flex items-center justify-center text-text-muted group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                <FileTextIcon size={20} strokeWidth={1.8} />
              </div>
              <div className="min-w-0 flex-1">
                <h3
                  className="text-sm font-medium text-text-primary group-hover:text-primary transition-colors leading-snug line-clamp-2"
                  title={label}
                >
                  {source.citation_index != null && (
                    <span className="text-primary font-bold mr-1">[{source.citation_index}]</span>
                  )}
                  {label}
                </h3>
                {meta && (
                  <p className="text-[11px] text-text-muted mt-0.5 leading-relaxed">{meta}</p>
                )}
              </div>
              {safe && (
                <ExternalLinkIcon
                  size={14}
                  className="text-text-disabled group-hover:text-primary transition-colors shrink-0 mt-0.5"
                />
              )}
            </div>
          );

          if (safe) {
            return (
              <a
                key={`${source.citation_index ?? index}-${index}`}
                href={source.open_url}
                target="_blank"
                rel="noopener noreferrer"
                className="group block p-4 rounded-xl border border-border bg-surface hover:border-border-strong hover:shadow-sm transition-all"
              >
                {card}
              </a>
            );
          }

          return (
            <div
              key={`${source.citation_index ?? index}-${index}`}
              className="group p-4 rounded-xl border border-border bg-surface opacity-70 cursor-not-allowed"
              title="Không có liên kết tài liệu"
            >
              {card}
            </div>
          );
        })}
      </div>

      {/* Footer disclaimer */}
      <div className="px-5 py-3 border-t border-border">
        <p className="text-[11px] text-text-muted leading-relaxed">
          Các nguồn tham khảo được truy xuất từ cơ sở dữ liệu nội bộ HACOM.
          Hãy kiểm chứng các thông tin quan trọng.
        </p>
      </div>
    </motion.div>
  );
};
