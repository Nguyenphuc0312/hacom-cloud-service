import React, { useRef, useCallback, useState, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { PersonalAiSidebar } from "../components/layout/PersonalAiSidebar";
import { SourceHubPanel } from "../components/source-hub/SourceHubPanel";
import { PersonalChatArea } from "../components/chat/PersonalChatArea";
import { PersonalChatInput } from "../components/chat/PersonalChatInput";
import { PersonalWorkspaceHeader } from "../components/layout/PersonalWorkspaceHeader";
import { usePersonalChat } from "../hooks/usePersonalChat";
import { matchLevelReportTag, deletePersonalAttachment, PersonalAiError } from "../api/personalAiApi";
import { isReportSubmissionText } from "../permissions/reportTags";
import { usePersonalDocuments } from "../hooks/usePersonalDocuments";
import { usePersonalAiStore } from "../stores/personalAiStore";
import { useAuthStore } from "../../../stores/authStore";
import { fetchPersonalSessions } from "../../ai-assistant/services/aiChatApi";
import { toast } from "../../../utils/toast";
import { ConfirmDialog } from "../../../components/ui";

const WEEKLY_REPORT_MAX_BYTES = 25 * 1024 * 1024; // 25 MB

/**
 * Trần tệp hỏi đáp TẠM — BE chặn ở 10MB ("Tệp quá lớn (tối đa 10MB)").
 *
 * Phải chặn ở FE bằng ĐÚNG con số của BE: để 25MB như luồng nộp báo cáo thì tệp
 * 10–25MB lọt qua, user chờ hết thời gian upload rồi mới nhận lỗi từ server.
 */
const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

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
  const removeAttachment = usePersonalAiStore((s) => s.removeAttachment);
  const activeConversationId = usePersonalAiStore((s) => s.activeConversationId);
  const activeConversation = usePersonalAiStore((s) =>
    s.conversations.find((c) => c.id === s.activeConversationId),
  );
  // Chip của ĐÚNG hội thoại đang mở — không mang sang hội thoại khác.
  // Bỏ tệp đã dùng cho một câu hỏi: hỏi xong là tệp "đi luôn" khỏi ô nhập, nó đã
  // hiện trong bong bóng của lượt hỏi đó. Tệp vẫn nằm trong store nên các lượt
  // sau vẫn gửi kèm `attachment_ids`.
  const attachments = (activeConversation?.attachments ?? []).filter((a) => !a.consumed);
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

  /**
   * Xoá chip tệp hỏi đáp tạm. Gọi BE TRƯỚC, chỉ bỏ chip khi BE trả 2xx — bỏ
   * trước rồi lỗi sẽ khiến câu hỏi sau vẫn gửi kèm ID mà user tưởng đã xoá.
   */
  const handleRemoveAttachment = useCallback(
    async (attachmentId: string) => {
      const sessionId = activeConversation?.serverSessionId;
      if (!sessionId || !activeConversationId) return;
      try {
        await deletePersonalAttachment(attachmentId, sessionId);
        removeAttachment(activeConversationId, attachmentId);
      } catch (err) {
        toast.error(
          err instanceof PersonalAiError && err.kind === "http"
            ? err.message
            : "Không xoá được tệp đính kèm. Vui lòng thử lại.",
        );
      }
    },
    [activeConversation?.serverSessionId, activeConversationId, removeAttachment],
  );

  const handleSubmit = useCallback(
    async (text: string) => {
      // Mọi lượt gửi KÈM FILE đều là hành động không hoàn tác được (ghi đè bản
      // tuần này, hoặc nộp thẳng lên cấp trên) → hỏi lại trước khi rời máy.
      // Không hoàn tác được nghĩa là bấm nhầm không sửa được, nên không có
      // ngoại lệ nào ở đây kể cả khi BE tự thay bản cũ giúp.
      if (pendingFile) {
        // Đang nộp dở / đã mở hộp xác nhận → bỏ qua, không xếp chồng hai lượt.
        if (isUploading || pendingSubmit) return;
        // Hỏi đáp tệp tạm KHÔNG phải hành động không hoàn tác được: tệp không rời
        // khỏi hội thoại, không ghi đè báo cáo nào. Hộp xác nhận ở đây chỉ để
        // chặn lượt NỘP, nên bỏ qua để không bắt user xác nhận vô cớ.
        if (!isReportSubmissionText(text)) {
          // Trần của luồng hỏi đáp tạm (10MB) THẤP HƠN luồng nộp báo cáo (25MB),
          // mà lúc đính tệp chưa biết user sẽ đi luồng nào — nên chặn đúng ở đây,
          // khi đã biết. Không chặn thì user chờ upload xong mới nhận lỗi BE.
          if (pendingFile.size > ATTACHMENT_MAX_BYTES) {
            toast.error(
              `Tệp "${pendingFile.name}" quá lớn (hỏi đáp tệp tối đa 10MB). Vui lòng dùng tệp nhỏ hơn.`,
            );
            return;
          }
          setIsUploading(true);
          setInputValue("");
          const accepted = await sendWithFile(text, pendingFile);
          if (accepted) setPendingFile(null);
          setIsUploading(false);
          setTimeout(() => textareaRef.current?.focus(), 0);
          return;
        }
        setPendingSubmit(describeSubmit(text, pendingFile));
        return;
      }
      // Tag nộp mà KHÔNG đính tệp → đây là lượt XEM, không nộp gì cả. Nói trước
      // để người quên đính tệp không tưởng là đã nộp xong.
      // Dùng parser lệnh: câu chỉ NHẮC tới tag giữa dòng không phải lượt xem báo cáo.
      if (matchLevelReportTag(text) && isReportSubmissionText(text)) {
        toast.info("Đang xem báo cáo. Muốn nộp thì đính kèm tệp báo cáo rồi gửi lại.");
      }
      setInputValue("");
      await sendMessage(text);
      setTimeout(() => textareaRef.current?.focus(), 0);
    },
    [sendMessage, sendWithFile, pendingFile, isUploading, pendingSubmit],
  );

  /** Người dùng đã xác nhận gửi → thực sự nộp file. */
  const handleConfirmSubmit = useCallback(async () => {
    const submit = pendingSubmit;
    if (!submit) return;
    setPendingSubmit(null);
    setInputValue("");
    setIsUploading(true);
    // Nộp file KÈM tag báo cáo cấp (#TBP_baocao / #LDDV_baocao) đi endpoint
    // riêng /api/level-reports/upload; BE tự thay bản cũ nếu nộp lại cùng tuần.
    const accepted =
      submit.kind === "level"
        ? await sendLevelReportWithFile(submit.text, submit.file)
        : await sendWithFile(submit.text, submit.file);
    // Contract 07/08/26 §7.10: CHỈ xoá tệp đang chờ sau HTTP 2xx. Xoá sớm như
    // trước khiến mọi lỗi (sai form, sai tuần, hết phiên, mất mạng) đều bắt user
    // đi tìm và đính lại đúng file đó — trong khi lý do lỗi bảo họ "thử lại".
    if (accepted) setPendingFile(null);
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
              attachments={attachments}
              onRemoveAttachment={handleRemoveAttachment}
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
