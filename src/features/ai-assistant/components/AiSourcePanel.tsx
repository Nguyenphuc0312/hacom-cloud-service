import React, { useState, useCallback } from "react";
import {
  XIcon,
  ExternalLinkIcon,
  BookOpenIcon,
  RefreshCwIcon,
  AlertCircleIcon,
  SearchIcon,
} from "lucide-react";
import { useAiAssistantStore } from "../state/aiAssistantStore";
import { useChatUiStore } from "../../chat/state/chatUiStore";
import { useAuthStore } from "../../../stores/authStore";
import { motion } from "framer-motion";
import type { AiSource } from "../types";
import { getSourceHref, getSourceLabel, getSourceMeta } from "../utils/sourceUtils";
import { sendAiChatMessage } from "../services/aiChatApi";
import { useOpenAiSource } from "../hooks/useOpenAiSource";
import { getFileIconTypeByName } from "../../../utils/formatFileSize";
import { FileTypeIcon } from "../../../components/message/FileTypeIcon";

/** Chuỗi tên/label chứa phần mở rộng file để suy ra loại icon (pdf/word/excel…). */
function getSourceFileName(source: AiSource): string {
  return source.source_file || source.document_name || source.source_name || source.display_label || "";
}

export const AiSourcePanel: React.FC = () => {
  const { conversations, activeConversationId, toggleSourcePanel, setSelectedSources } = useAiAssistantStore();
  const { selectedEndpoint } = useChatUiStore();
  const user = useAuthStore((s) => s.user);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const { open, openingUrl, isOpening } = useOpenAiSource();

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

  // ponytail: temp debug — remove after confirming source URL fields from BE.
  if (sources.length > 0) {
    console.log("[ai-source] first source object:", sources[0]);
    console.log("[ai-source] resolved href:", getSourceHref(sources[0]));
  }

  const filteredSources = searchQuery.trim()
    ? sources.filter((s) =>
        getSourceLabel(s).toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : sources;

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
        request.user_name =
          user?.fullNameFromHr ?? user?.fullNameFromHR ?? user?.displayName ?? user?.username ?? "";
      } else {
        request.employee_code = user?.employeeCode ?? user?.employee_code ?? "";
        request.employee_name =
          user?.fullNameFromHr ?? user?.fullNameFromHR ?? user?.displayName ?? user?.username ?? "";
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
      <div className="flex flex-col gap-0 border-b border-border">
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2">
            <BookOpenIcon size={18} className="text-text-secondary" strokeWidth={2} />
            <h2 className="text-sm font-semibold text-text-primary">Nguồn tham khảo</h2>
            <span className="bg-surface-hover text-text-secondary text-[11px] px-2 py-0.5 rounded-full font-medium">
              {searchQuery ? filteredSources.length : sources.length}
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

        {/* Search input */}
        <div className="px-4 pb-3">
          <div className="relative">
            <SearchIcon
              size={14}
              strokeWidth={2}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm nguồn tham khảo…"
              className="w-full rounded-xl border border-border bg-surface-hover py-2 pl-8 pr-8 text-xs text-text-primary placeholder:text-text-muted focus:border-primary/40 focus:bg-surface focus:outline-none focus:ring-1 focus:ring-primary/20 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
                aria-label="Xóa tìm kiếm"
              >
                <XIcon size={13} strokeWidth={2.5} />
              </button>
            )}
          </div>
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
        {filteredSources.length === 0 && searchQuery ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <SearchIcon size={20} strokeWidth={1.5} className="text-text-muted" />
            <p className="text-xs text-text-muted">
              Không tìm thấy nguồn nào khớp với{" "}
              <span className="font-medium text-text-secondary">"{searchQuery}"</span>
            </p>
          </div>
        ) : null}
        {filteredSources.map((source, index) => {
          const label = getSourceLabel(source);
          const meta = getSourceMeta(source);
          const href = getSourceHref(source);
          const safe = Boolean(href);

          const card = (
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 shrink-0 rounded-lg bg-surface-hover flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                <FileTypeIcon
                  type={getFileIconTypeByName(getSourceFileName(source))}
                  className="h-5 w-5"
                />
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
                  className="text-text-disabled group-hover:text-primary transition-colors shrink-0"
                />
              )}
            </div>
          );

          if (safe) {
            return (
              <button
                key={`${source.citation_index ?? index}-${index}`}
                type="button"
                onClick={() => void open(href)}
                disabled={isOpening}
                aria-busy={openingUrl === href}
                className="group block w-full text-left p-4 rounded-xl border border-border bg-surface hover:border-border-strong hover:shadow-sm transition-all disabled:cursor-wait"
              >
                {card}
              </button>
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
