import React, { useState, useCallback, useRef, useEffect } from "react";
import { AiAssistantHero } from "../components/AiAssistantHero";
import { AiPromptBox } from "../components/AiPromptBox";
import { AiSuggestionChips } from "../components/AiSuggestionChips";
import { AiChatPreview } from "../components/AiChatPreview";
import {
  sendAiChatMessage,
  uploadPersonalWeeklyReport,
  invalidateWeeklyReportFilenameCache,
  AiApiError,
} from "../services/aiChatApi";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../stores/authStore";
import { useAiAssistantStore } from "../state/aiAssistantStore";
import { useChatUiStore } from "../../chat/state/chatUiStore";
import { AiLayout } from "../components/AiLayout";
import { AiChatHeader } from "../components/AiChatHeader";
import { AiWeeklyReportFilesDialog } from "../components/AiWeeklyReportFilesDialog";
import { toast } from "../../../utils/toast";
import type { AiMessage } from "../types";
import { PersonalAiWorkspacePage } from "../../personal-ai/pages/PersonalAiWorkspacePage";

const WEEKLY_REPORT_MAX_BYTES = 25 * 1024 * 1024; // 25 MB
const WEEKLY_REPORT_ACCEPT =
  ".pdf,.doc,.docx,.txt,.md,.csv,.xls,.xlsx,.ppt,.pptx";

/**
 * Trang AI Assistant chính – layout kiểu ChatGPT.
 * Empty state: Hero + Input + Suggestions ở giữa.
 * Chat state: Messages scrollable + Input sticky bottom.
 */
export const AiAssistantPage: React.FC = () => {
  const { t } = useTranslation("aiAssistant");
  const user = useAuthStore((s) => s.user);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [weeklyReportsOpen, setWeeklyReportsOpen] = useState(false);
  const [weeklyReportsRefreshKey, setWeeklyReportsRefreshKey] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const openWeeklyReportFilePickerRef = useRef<() => void>(() => {});

  // Global state
  const {
    conversations,
    activeConversationId,
    addMessage,
    updateLastMessage,
    updateMessage,
    setThinking,
    createNewConversation,
  } = useAiAssistantStore();
  const { selectedEndpoint } = useChatUiStore();

  const activeConversation = conversations.find(
    (c) => c.id === activeConversationId && c.endpoint === selectedEndpoint,
  );
  const messages = activeConversation?.messages || [];

  const userDisplayName = user
    ? user.effectiveDisplayName ||
    user.displayName ||
    user.fullName ||
    user.firstName ||
    user.username
    : undefined;

  const isPersonal = selectedEndpoint === "personal";

  /** Helper: chuẩn hoá nội dung message của user khi gửi kèm file. */
  const buildUserMessageContent = useCallback(
    (questionText: string, file: File | null): string => {
      if (!file) return questionText;
      return `[Tệp đính kèm: ${file.name}]\n\n${questionText}`;
    },
    [],
  );

  /** Helper: lấy session_id ổn định cho conversation cá nhân hiện tại. */
  const resolvePersonalSessionId = useCallback(
    (conversationId: string | null): string => {
      const sid = (conversationId ?? "").trim();
      return sid || "default";
    },
    [],
  );

  /** Helper: mapping lỗi từ AiApiError sang message tiếng Việt. */
  const describeApiError = useCallback(
    (err: unknown, fallback: string): string => {
      if (err instanceof AiApiError) {
        if (err.kind === "timeout") return t("chat.errorTimeout");
        if (err.kind === "network") return t("chat.errorNetwork");
        if (err.status === 422) return t("chat.error422");
        if (err.status === 413)
          return "Tệp vượt quá dung lượng cho phép của máy chủ.";
        if (err.status === 415)
          return "Định dạng tệp không được hỗ trợ.";
        if (err.status === 401 || err.status === 403)
          return "Bạn không có quyền sử dụng tính năng này.";
      }
      return fallback;
    },
    [t],
  );

  /** Gửi tin nhắn đến AI API */
  const handleSubmit = useCallback(
    async (promptText: string) => {
      const trimmed = promptText.trim();
      if (!trimmed || isLoading || isUploading) return;

      const fileToSend = pendingFile;
      const usingUpload = isPersonal && !!fileToSend;

      let currentId = activeConversationId;

      // Tạo conversation mới nếu chưa có hoặc endpoint không khớp
      if (
        !currentId ||
        conversations.find((c) => c.id === currentId)?.endpoint !==
        selectedEndpoint
      ) {
        currentId = createNewConversation(selectedEndpoint);
      }

      const userMessage: AiMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: buildUserMessageContent(trimmed, fileToSend),
        timestamp: new Date(),
      };

      addMessage(currentId, userMessage);
      setInputValue("");

      // Tạo placeholder message cho AI
      const assistantMessageId = crypto.randomUUID();
      const assistantMessage: AiMessage = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
        isStreaming: true,
      };
      addMessage(currentId, assistantMessage);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      if (usingUpload) {
        setIsUploading(true);
      } else {
        setIsLoading(true);
      }

      // Tracked ở ngoài try/catch để catch block biết có widget đặc biệt hay không
      let hasSpecialEvent = false;

      // Helper — ghi đè message assistant, bảo vệ widget đặc biệt đã set
      const finalizeAssistantMessage = (patch: Partial<AiMessage>) => {
        useAiAssistantStore.setState((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === currentId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === assistantMessageId
                      ? { ...m, ...patch }
                      : m,
                  ),
                }
              : c,
          ),
        }));
      };

      try {
        if (usingUpload && fileToSend) {
          const sessionId = resolvePersonalSessionId(currentId);
          const response = await uploadPersonalWeeklyReport(
            fileToSend,
            {
              question: trimmed,
              session_id: sessionId,
              employee_code: user?.employeeCode ?? user?.employee_code ?? "",
              employee_name:
                user?.fullNameFromHr ??
                user?.fullNameFromHR ??
                user?.displayName ??
                user?.username ??
                "",
              department: user?.departmentName ?? "",
              company:
                user?.companyName ?? user?.company_name ?? user?.orgUnit ?? "",
              week_start: "",
              week_end: "",
            },
            { signal: controller.signal },
          );

          const answerText =
            (response.answer && response.answer.trim()) ||
            `Đã nhận tệp "${fileToSend.name}". Bạn muốn hỏi gì thêm về tệp này?`;

          finalizeAssistantMessage({
            content: answerText,
            sources: response.sources,
            isStreaming: false,
          });

          setPendingFile(null);
          invalidateWeeklyReportFilenameCache();
          setWeeklyReportsRefreshKey((k) => k + 1);
        } else {
          const isCompany = selectedEndpoint === "company";
          const request: any = {
            question: trimmed,
            session_id: currentId || "",
            department: user?.departmentName || "",
          };

          if (isCompany) {
            request.user_id = user?.id || "";
            request.user_name =
              user?.fullNameFromHr ||
              user?.fullNameFromHR ||
              user?.displayName ||
              user?.username ||
              "";
          } else {
            request.employee_code =
              user?.employeeCode || user?.employee_code || "";
            request.employee_name =
              user?.fullNameFromHr ||
              user?.fullNameFromHR ||
              user?.displayName ||
              user?.username ||
              "";
          }

          const response = await sendAiChatMessage(request, selectedEndpoint, {
            onToken: (token) => {
              updateLastMessage(currentId!, token, true);
            },
            onThinking: (thinking) => {
              setThinking(currentId!, thinking);
            },
            onFormRequest: (formData) => {
              hasSpecialEvent = true;
              finalizeAssistantMessage({ content: "", formRequest: formData, isStreaming: false });
            },
            onSelectionRequest: (selectionData) => {
              hasSpecialEvent = true;
              finalizeAssistantMessage({ content: "", selectionRequest: selectionData, isStreaming: false });
            },
          });

          // Chỉ update content khi không có widget đặc biệt
          if (!hasSpecialEvent) {
            finalizeAssistantMessage({
              content: response.answer,
              sources: response.sources,
              isStreaming: false,
            });
          }
        }
      } catch (err) {
        const content = describeApiError(err, t("chat.errorNetwork"));

        // Không ghi đè widget đặc biệt đã render nếu lỗi xảy ra sau onSelectionRequest/onFormRequest
        if (!hasSpecialEvent) {
          finalizeAssistantMessage({ content, isError: true, isStreaming: false });
        } else {
          // Chỉ tắt spinner, giữ nguyên widget
          finalizeAssistantMessage({ isStreaming: false });
        }

        if (usingUpload && fileToSend) {
          toast.error(`Tải lên "${fileToSend.name}" thất bại: ${content}`);
        }
      } finally {
        if (usingUpload) {
          setIsUploading(false);
        } else {
          setIsLoading(false);
        }
        abortControllerRef.current = null;
        setTimeout(() => textareaRef.current?.focus(), 0);
      }
    },
    [
      isLoading,
      isUploading,
      pendingFile,
      isPersonal,
      activeConversationId,
      conversations,
      selectedEndpoint,
      user,
      addMessage,
      updateLastMessage,
      updateMessage,
      setThinking,
      createNewConversation,
      buildUserMessageContent,
      resolvePersonalSessionId,
      describeApiError,
      t,
    ],
  );

  /** Stage file để gửi kèm câu hỏi (không upload ngay). */
  const handleAttachFiles = useCallback(
    (files: File[]) => {
      if (selectedEndpoint !== "personal") return;
      if (isLoading || isUploading) return;

      const file = files[0];
      if (!file) return;
      if (files.length > 1) {
        toast.info(
          `Hiện chỉ hỗ trợ đính kèm 1 tệp mỗi lần — sẽ dùng "${file.name}".`,
        );
      }
      if (file.size > WEEKLY_REPORT_MAX_BYTES) {
        toast.error(
          `Tệp "${file.name}" quá lớn (giới hạn 25MB). Vui lòng chọn tệp nhỏ hơn.`,
        );
        return;
      }

      setPendingFile(file);
      // Focus textarea để user gõ câu hỏi luôn
      setTimeout(() => textareaRef.current?.focus(), 0);
    },
    [selectedEndpoint, isLoading, isUploading],
  );

  const handleRemoveAttachment = useCallback(() => {
    if (isUploading) return;
    setPendingFile(null);
  }, [isUploading]);

  // Khi user chuyển endpoint sang công ty thì xoá file đã stage (endpoint khác không hỗ trợ).
  useEffect(() => {
    if (!isPersonal && pendingFile) {
      setPendingFile(null);
    }
  }, [isPersonal, pendingFile]);

  const hasMessages = messages.length > 0;
  const attachHandler = isPersonal ? handleAttachFiles : undefined;

  const handleRegisterFilePicker = useCallback((open: () => void) => {
    openWeeklyReportFilePickerRef.current = open;
  }, []);

  const defaultCompany =
    user?.companyName ?? user?.company_name ?? user?.orgUnit ?? "";

  const weeklyReportPromptProps = isPersonal
    ? {
        weeklyReportAttachMenu: true as const,
        onOpenWeeklyReports: () => setWeeklyReportsOpen(true),
        onRegisterFilePicker: handleRegisterFilePicker,
      }
    : {};

  // Auto focus input
  useEffect(() => {
    textareaRef.current?.focus();
  }, [activeConversationId]);

  // Personal mode → NotebookLM-style workspace (after all hooks)
  if (isPersonal) {
    return <PersonalAiWorkspacePage />;
  }

  return (
    <AiLayout>
      <AiWeeklyReportFilesDialog
        isOpen={weeklyReportsOpen}
        onClose={() => setWeeklyReportsOpen(false)}
        defaultCompany={defaultCompany}
        refreshKey={weeklyReportsRefreshKey}
        onUploadNew={() => openWeeklyReportFilePickerRef.current()}
      />

      <div className="flex h-full flex-col overflow-hidden bg-surface">
        <AiChatHeader />

        {/* ── Empty state: Hero + Input + Suggestions căn giữa ── */}
        {!hasMessages && (
          <div className="flex flex-1 items-center justify-center overflow-y-auto px-4">
            <div className="flex w-full max-w-[680px] flex-col items-center gap-8 py-16">
              <AiAssistantHero displayName={userDisplayName} />

              <div className="w-full">
                <AiPromptBox
                  ref={textareaRef}
                  value={inputValue}
                  onChange={setInputValue}
                  onSubmit={handleSubmit}
                  isLoading={isLoading}
                  isUploading={isUploading}
                  onAttachFiles={attachHandler}
                  attachAccept={isPersonal ? WEEKLY_REPORT_ACCEPT : undefined}
                  attachMultiple={false}
                  pendingAttachment={
                    isPersonal && pendingFile ? { file: pendingFile } : null
                  }
                  onRemoveAttachment={
                    isPersonal ? handleRemoveAttachment : undefined
                  }
                  attachmentHint="Đặt câu hỏi về báo cáo đã đính kèm..."
                  {...weeklyReportPromptProps}
                />
              </div>

              <div className="w-full">
                <AiSuggestionChips
                  onSelect={(prompt) => {
                    setInputValue(prompt);
                    setTimeout(() => textareaRef.current?.focus(), 0);
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Chat state: Messages + Input sticky bottom ── */}
        {hasMessages && (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Scrollable messages */}
            <div className="flex-1 overflow-y-auto ai-scrollbar">
              <AiChatPreview
                messages={messages}
                isLoading={isLoading}
                onUpdateMessage={(msgId, patch) =>
                  activeConversationId &&
                  updateMessage(activeConversationId, msgId, patch)
                }
              />
            </div>

            {/* Input sticky bottom */}
            <div className="flex-shrink-0 border-t border-border bg-surface px-4 py-4">
              <div className="mx-auto max-w-[768px]">
                <AiPromptBox
                  ref={textareaRef}
                  value={inputValue}
                  onChange={setInputValue}
                  onSubmit={handleSubmit}
                  isLoading={isLoading}
                  isUploading={isUploading}
                  onAttachFiles={attachHandler}
                  attachAccept={isPersonal ? WEEKLY_REPORT_ACCEPT : undefined}
                  attachMultiple={false}
                  pendingAttachment={
                    isPersonal && pendingFile ? { file: pendingFile } : null
                  }
                  onRemoveAttachment={
                    isPersonal ? handleRemoveAttachment : undefined
                  }
                  attachmentHint="Đặt câu hỏi về báo cáo đã đính kèm..."
                  {...weeklyReportPromptProps}
                />
                <p className="mt-2 text-center text-[11px] text-text-muted">
                  AI có thể đưa ra thông tin không chính xác. Hãy kiểm chứng
                  các thông tin quan trọng.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </AiLayout>
  );
};

export default AiAssistantPage;
