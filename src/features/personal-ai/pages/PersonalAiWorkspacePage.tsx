import React, { useRef, useCallback, useState, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { PersonalAiSidebar } from "../components/layout/PersonalAiSidebar";
import { SourceHubPanel } from "../components/source-hub/SourceHubPanel";
import { PersonalChatArea } from "../components/chat/PersonalChatArea";
import { PersonalChatInput } from "../components/chat/PersonalChatInput";
import { PersonalWorkspaceHeader } from "../components/layout/PersonalWorkspaceHeader";
import { usePersonalChat } from "../hooks/usePersonalChat";
import { usePersonalDocuments } from "../hooks/usePersonalDocuments";
import { usePersonalAiStore } from "../stores/personalAiStore";
import { useAuthStore } from "../../../stores/authStore";
import { fetchPersonalSessions } from "../../ai-assistant/services/aiChatApi";
import { toast } from "../../../utils/toast";

const WEEKLY_REPORT_MAX_BYTES = 25 * 1024 * 1024; // 25 MB

/**
 * Full-page Personal AI Workspace — NotebookLM-inspired three-panel layout.
 *
 * ┌──────────────┬──────────────────────────────┬──────────────┐
 * │  Sidebar     │       AI Conversation         │  Source Hub  │
 * │  (shared)    │                               │  (RAG mode)  │
 * └──────────────┴──────────────────────────────┴──────────────┘
 */
export const PersonalAiWorkspacePage: React.FC = () => {
  const { messages, isStreaming, isLoadingHistory, sendMessage, sendWithFile, stopStreaming } = usePersonalChat();
  const { isRagMode } = usePersonalDocuments();
  const isSourcePanelOpen = usePersonalAiStore((s) => s.isSourcePanelOpen);
  const loadServerSessions = usePersonalAiStore((s) => s.loadServerSessions);
  const setOwnerId = usePersonalAiStore((s) => s.setOwnerId);
  const user = useAuthStore((s) => s.user);

  // Set ownerId ngay khi biết user — đảm bảo conversation mới luôn được gắn đúng chủ sở hữu
  // kể cả trước khi sessions load xong
  const employeeCodeKey = user?.employeeCode ?? user?.employee_code ?? "";
  useEffect(() => {
    if (employeeCodeKey) setOwnerId(employeeCodeKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeCodeKey]);

  // Sau khi mount: tải danh sách session từ backend để lịch sử đi theo tài khoản
  useEffect(() => {
    const employeeCode = user?.employeeCode ?? user?.employee_code ?? "";
    if (!employeeCode) return;

    const ac = new AbortController();
    fetchPersonalSessions({ signal: ac.signal })
      .then(({ sessions }) => {
        if (sessions.length > 0) {
          loadServerSessions(sessions, employeeCode);
        }
      })
      .catch(() => {
        // Silent — dùng localStorage fallback nếu không kết nối được
      });
    return () => ac.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.employeeCode, user?.employee_code]);

  const [inputValue, setInputValue] = React.useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleAttachFile = useCallback((file: File) => {
    if (file.size > WEEKLY_REPORT_MAX_BYTES) {
      toast.error(`Tệp "${file.name}" quá lớn (giới hạn 25 MB). Vui lòng chọn tệp nhỏ hơn.`);
      return;
    }
    setPendingFile(file);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, []);

  const handleRemoveFile = useCallback(() => {
    if (!isUploading) setPendingFile(null);
  }, [isUploading]);

  const handleSubmit = useCallback(
    async (text: string) => {
      if (pendingFile) {
        // Upload báo cáo tuần là GHI ĐÈ (mỗi tuần chỉ giữ 1 file) — xác nhận trước.
        const confirmed = window.confirm(
          `Tải lên báo cáo tuần sẽ THAY THẾ file của tuần này (mỗi tuần chỉ giữ 1 file).\n\nTiếp tục với "${pendingFile.name}"?`,
        );
        if (!confirmed) return;
        setInputValue("");
        setPendingFile(null);
        setIsUploading(true);
        await sendWithFile(text, pendingFile);
        setIsUploading(false);
      } else {
        setInputValue("");
        await sendMessage(text);
      }
      setTimeout(() => textareaRef.current?.focus(), 0);
    },
    [sendMessage, sendWithFile, pendingFile],
  );

  const handleSuggestionSelect = useCallback((value: string) => {
    setInputValue(value);
    setTimeout(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      const end = value.length;
      textarea.setSelectionRange(end, end);
    }, 0);
  }, []);

  return (
    <div className="flex h-full w-full overflow-hidden bg-surface font-sans">
      {/* ── Left: Conversation Sidebar ── */}
      <aside className="h-full w-[260px] flex-shrink-0">
        <PersonalAiSidebar />
      </aside>

      {/* ── Center: Chat workspace ── */}
      <main className="flex h-full min-w-0 flex-1 flex-col">
        <PersonalWorkspaceHeader />

        {/* Message timeline */}
        <PersonalChatArea
          messages={messages}
          isStreaming={isStreaming}
          isLoadingHistory={isLoadingHistory}
          isRagMode={isRagMode}
          onSuggestionSelect={handleSuggestionSelect}
        />

        {/* Sticky input footer */}
        <div className="flex-shrink-0 border-t border-border bg-surface px-4 py-4">
          <div className="mx-auto w-full max-w-[820px]">
            <PersonalChatInput
              ref={textareaRef}
              value={inputValue}
              onChange={setInputValue}
              onSubmit={handleSubmit}
              onStop={stopStreaming}
              isStreaming={isStreaming}
              isRagMode={isRagMode}
              pendingFile={pendingFile}
              onAttachFile={handleAttachFile}
              onRemoveFile={handleRemoveFile}
              isUploading={isUploading}
            />
          </div>
        </div>
      </main>

      {/* ── Right: Source Hub ── */}
      <AnimatePresence>
        {isSourcePanelOpen && (
          <div className="flex-shrink-0">
            <SourceHubPanel />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PersonalAiWorkspacePage;
