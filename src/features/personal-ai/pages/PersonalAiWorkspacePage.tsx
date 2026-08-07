import React, { useRef, useCallback, useState, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { PersonalAiSidebar } from "../components/layout/PersonalAiSidebar";
import { SourceHubPanel } from "../components/source-hub/SourceHubPanel";
import { PersonalChatArea } from "../components/chat/PersonalChatArea";
import { PersonalChatInput } from "../components/chat/PersonalChatInput";
import { PersonalWorkspaceHeader } from "../components/layout/PersonalWorkspaceHeader";
import { usePersonalChat } from "../hooks/usePersonalChat";
import { matchLevelReportTag } from "../api/personalAiApi";
import { usePersonalDocuments } from "../hooks/usePersonalDocuments";
import { usePersonalAiStore } from "../stores/personalAiStore";
import { useAuthStore } from "../../../stores/authStore";
import { fetchPersonalSessions } from "../../ai-assistant/services/aiChatApi";
import { toast } from "../../../utils/toast";
import { ConfirmDialog } from "../../../components/ui";

const WEEKLY_REPORT_MAX_BYTES = 25 * 1024 * 1024; // 25 MB

/** Lượt nộp file đang chờ user xác nhận (xem `pendingSubmit`). */
interface PendingSubmit {
  /** `level` = nộp lên cấp trên (#TBP/#LDDV); `weekly` = báo cáo tuần cá nhân. */
  kind: "level" | "weekly";
  text: string;
  file: File;
  title: string;
  message: string;
  confirmText: string;
}

/**
 * Nội dung hộp xác nhận cho một lượt nộp file. Nói rõ báo cáo đi ĐÂU và điều gì
 * xảy ra với bản cũ — người dùng đã từng lỡ gửi thẳng lên TBP vì không có bước
 * hỏi lại nào.
 */
function describeSubmit(text: string, file: File): PendingSubmit {
  const tag = matchLevelReportTag(text);
  if (tag) {
    return {
      kind: "level",
      text,
      file,
      title: `Gửi ${tag.destination}?`,
      // Nhắc về bản nháp AI ngay ở đây: BE từ chối file do AI sinh (nhận diện
      // bằng dấu nhúng trong file, đổi tên không qua được). Người dùng phải
      // biết TRƯỚC khi tốn công gửi, không phải lúc bị chặn.
      message: `Tệp "${file.name}" sẽ được nộp ${tag.destinationLong}. Bản đã nộp của tuần này (nếu có) sẽ bị thay thế.\n\nLưu ý: bản nháp AI (chỉ để đọc tham khảo) không dùng để nộp — hãy nộp file báo cáo do bộ phận tự lập.`,
      confirmText: "Gửi báo cáo",
    };
  }
  return {
    kind: "weekly",
    text,
    file,
    title: "Gửi báo cáo tuần?",
    message: `Tệp "${file.name}" sẽ THAY THẾ báo cáo tuần này của bạn (mỗi tuần chỉ giữ 1 file).`,
    confirmText: "Gửi báo cáo",
  };
}

/**
 * Full-page Personal AI Workspace — NotebookLM-inspired three-panel layout.
 *
 * ┌──────────────┬──────────────────────────────┬──────────────┐
 * │  Sidebar     │       AI Conversation         │  Source Hub  │
 * │  (shared)    │                               │  (RAG mode)  │
 * └──────────────┴──────────────────────────────┴──────────────┘
 */
export const PersonalAiWorkspacePage: React.FC = () => {
  const {
    messages,
    isStreaming,
    isLoadingHistory,
    sendMessage,
    sendWithFile,
    sendLevelReportWithFile,
    stopStreaming,
  } = usePersonalChat();
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
  /**
   * Lượt nộp file đã bấm Gửi nhưng CHƯA xác nhận. Mọi luồng đính file (báo cáo
   * tuần cá nhân lẫn nộp lên cấp trên) đều dừng ở đây trước khi rời máy.
   */
  const [pendingSubmit, setPendingSubmit] = useState<PendingSubmit | null>(null);
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
      // Mọi lượt gửi KÈM FILE đều là hành động không hoàn tác được (ghi đè bản
      // tuần này, hoặc nộp thẳng lên cấp trên) → hỏi lại trước khi rời máy.
      // Không hoàn tác được nghĩa là bấm nhầm không sửa được, nên không có
      // ngoại lệ nào ở đây kể cả khi BE tự thay bản cũ giúp.
      if (pendingFile) {
        // Đang nộp dở / đã mở hộp xác nhận → bỏ qua, không xếp chồng hai lượt.
        if (isUploading || pendingSubmit) return;
        setPendingSubmit(describeSubmit(text, pendingFile));
        return;
      }
      // Tag nộp mà KHÔNG đính tệp → đây là lượt XEM, không nộp gì cả. Nói trước
      // để người quên đính tệp không tưởng là đã nộp xong.
      if (matchLevelReportTag(text)) {
        toast.info("Đang xem báo cáo. Muốn nộp thì đính kèm tệp báo cáo rồi gửi lại.");
      }
      setInputValue("");
      await sendMessage(text);
      setTimeout(() => textareaRef.current?.focus(), 0);
    },
    [sendMessage, pendingFile, isUploading, pendingSubmit],
  );

  /** Người dùng đã xác nhận gửi → thực sự nộp file. */
  const handleConfirmSubmit = useCallback(async () => {
    const submit = pendingSubmit;
    if (!submit) return;
    setPendingSubmit(null);
    setInputValue("");
    setPendingFile(null);
    setIsUploading(true);
    // Nộp file KÈM tag báo cáo cấp (#TBP_baocao / #LDDV_baocao) đi endpoint
    // riêng /api/level-reports/upload; BE tự thay bản cũ nếu nộp lại cùng tuần.
    if (submit.kind === "level") {
      await sendLevelReportWithFile(submit.text, submit.file);
    } else {
      await sendWithFile(submit.text, submit.file);
    }
    setIsUploading(false);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, [pendingSubmit, sendWithFile, sendLevelReportWithFile]);

  /** Hủy ở hộp xác nhận → giữ nguyên file + câu hỏi để sửa rồi gửi lại. */
  const handleCancelSubmit = useCallback(() => {
    setPendingSubmit(null);
    toast.info("Đã hủy gửi báo cáo. Tệp vẫn được giữ để bạn kiểm tra lại.");
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, []);

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
        <div className="flex-shrink-0 border-t border-border bg-surface px-4 py-4 sm:px-8 lg:px-12 xl:px-16">
          <div className="w-full">
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

      {/* Xác nhận trước khi nộp file — chặn gửi nhầm lên cấp trên / ghi đè bản tuần. */}
      <ConfirmDialog
        isOpen={pendingSubmit !== null}
        onClose={handleCancelSubmit}
        onConfirm={() => void handleConfirmSubmit()}
        title={pendingSubmit?.title ?? ""}
        message={pendingSubmit?.message ?? ""}
        confirmText={pendingSubmit?.confirmText ?? "Gửi"}
        cancelText="Hủy"
        variant="warning"
      />
    </div>
  );
};

export default PersonalAiWorkspacePage;
