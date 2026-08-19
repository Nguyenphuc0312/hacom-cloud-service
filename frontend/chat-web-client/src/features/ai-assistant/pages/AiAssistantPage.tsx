import React, { useState, useCallback, useRef, useEffect } from "react";
import { AiAssistantHero } from "../components/AiAssistantHero";
import { AiPromptBox } from "../components/AiPromptBox";
import { AiSuggestionChips } from "../components/AiSuggestionChips";
import { AiChatPreview } from "../components/AiChatPreview";
import {
  sendAiChatMessage,
  uploadPersonalWeeklyReport,
  invalidateWeeklyReportFilenameCache,
  fetchPersonalSessions,
  AiApiError,
} from "../services/aiChatApi";
import { useAiChatSessions, useAiChatHistory } from "../hooks/useAiChatQuery";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../stores/authStore";
import { useAiAssistantStore, flushStreamBuffer } from "../state/aiAssistantStore";
import { useChatUiStore } from "../../chat/state/chatUiStore";
import { AiLayout } from "../components/AiLayout";
import { AiChatHeader } from "../components/AiChatHeader";
import { AiWeeklyReportFilesDialog } from "../components/AiWeeklyReportFilesDialog";
import { toast } from "../../../utils/toast";
import type { AiMessage } from "../types";
import { PersonalAiWorkspacePage } from "../../personal-ai/pages/PersonalAiWorkspacePage";
import { usePersonalAiStore } from "../../personal-ai/stores/personalAiStore";

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
  // Chỉ dùng để áp prompt từ chip gợi ý vào ô nhập. Draft khi gõ nằm TRONG
  // AiPromptBox (state nội bộ) — không đẩy từng ký tự lên đây, nếu không mỗi
  // phím bấm sẽ render lại toàn bộ danh sách message.
  const [presetPrompt, setPresetPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [weeklyReportsOpen, setWeeklyReportsOpen] = useState(false);
  const [weeklyReportsRefreshKey, setWeeklyReportsRefreshKey] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const openWeeklyReportFilePickerRef = useRef<() => void>(() => {});
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  /** scrollHeight - scrollTop ngay trước khi prepend lịch sử cũ (để bù vị trí). */
  const prependAnchorRef = useRef<number | null>(null);

  // Global state
  const {
    conversations,
    activeConversationId,
    setActiveConversation,
    addMessage,
    updateLastMessage,
    updateMessage,
    setThinking,
    createNewConversation,
    loadServerSessions,
    updateServerSessionId,
    setOwnerId,
    loadMessagesForConversation,
  } = useAiAssistantStore();
  const { selectedEndpoint } = useChatUiStore();

  // Set ownerId ngay khi biết user — đảm bảo conversation mới luôn được gắn đúng chủ sở hữu
  // kể cả trước khi sessions load xong
  const ownerIdKey = user?.employeeCode ?? user?.employee_code ?? user?.id ?? "";
  useEffect(() => {
    if (ownerIdKey) setOwnerId(ownerIdKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerIdKey]);

  // Pre-load personal sessions ngay khi AiAssistantPage mount — kể cả khi đang
  // ở tab Công ty, để khi user chuyển sang Cá nhân sidebar đã có dữ liệu.
  const loadPersonalSessions = usePersonalAiStore((s) => s.loadServerSessions);
  useEffect(() => {
    const empCode = user?.employeeCode ?? user?.employee_code ?? "";
    if (!empCode) return;
    const ac = new AbortController();
    fetchPersonalSessions({ signal: ac.signal })
      .then(({ sessions }) => {
        if (sessions.length > 0) loadPersonalSessions(sessions, empCode);
      })
      .catch(() => {});
    return () => ac.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.employeeCode, user?.employee_code]);

  // Tải company sessions từ backend để lịch sử chat đi theo tài khoản.
  // Backend xác định tài khoản từ JWT Bearer token; userId chỉ dùng làm khoá
  // refetch khi đổi tài khoản đăng nhập.
  const companyUserId = user?.id ?? "";
  const { data: companySessions, refetch: refetchCompanySessions } =
    useAiChatSessions(companyUserId);

  // Mỗi lần MỞ tab Công ty → tải lại danh sách session mới nhất (GET /api/sessions),
  // khớp hợp đồng "gọi GET /api/sessions khi mở tab Công ty". Lần fetch đầu đã chạy
  // lúc mount; effect này lo các lần user quay lại tab. (Tab Cá nhân tự refetch vì
  // PersonalAiWorkspacePage remount mỗi lần mở.)
  const lastFetchedEndpointRef = useRef(selectedEndpoint);
  useEffect(() => {
    // Bỏ qua lần chạy đầu: useAiChatSessions đã fetch lúc mount rồi, gọi thêm ở
    // đây là GET /api/sessions trùng ngay khi mở trang.
    if (lastFetchedEndpointRef.current === selectedEndpoint) return;
    lastFetchedEndpointRef.current = selectedEndpoint;
    if (selectedEndpoint === "company") refetchCompanySessions();
  }, [selectedEndpoint, refetchCompanySessions]);

  useEffect(() => {
    if (!companySessions || companySessions.length === 0) return;
    const ownerId = user?.employeeCode ?? user?.employee_code ?? user?.id ?? "";
    if (!ownerId) return;
    loadServerSessions(
      companySessions.map((s) => ({
        session_id: s.id,
        title: s.title,
        created_at: s.createdAt,
        updated_at: s.updatedAt,
      })),
      "company",
      ownerId,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companySessions, user?.employeeCode, user?.employee_code, user?.id]);

  // Auto-select conversation đầu tiên nếu chưa có active (sau khi chuyển tab hoặc load lần đầu)
  useEffect(() => {
    if (selectedEndpoint === "personal" || activeConversationId) return;
    const first = conversations.find((c) => c.endpoint === selectedEndpoint);
    if (first) setActiveConversation(first.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId, conversations.length, selectedEndpoint]);

  const activeConversation = conversations.find(
    (c) => c.id === activeConversationId && c.endpoint === selectedEndpoint,
  );

  // Fetch messages từ server khi conversation có serverSessionId nhưng chưa có messages trên thiết bị này.
  const rawServerSessionId = activeConversation?.serverSessionId;
  // Quyết định "có tải hay không" chốt MỘT LẦN mỗi session. Nếu tính lại theo
  // messages.length thì ngay sau khi trang đầu nạp vào store, id sẽ thành null
  // → hook huỷ state → mất cờ hasMore, không tải được lịch sử cũ hơn nữa.
  const [fetchDecision, setFetchDecision] = useState<{
    sid: string | null | undefined;
    sessionIdToFetch: string | null;
  }>({ sid: undefined, sessionIdToFetch: null });
  if (fetchDecision.sid !== rawServerSessionId) {
    setFetchDecision({
      sid: rawServerSessionId,
      // Bỏ qua session ẩn danh (anon-*): tạo lúc chưa đăng nhập, không thuộc
      // tài khoản này nên backend luôn trả 403 — fetch chỉ tổ log đỏ trên F12.
      sessionIdToFetch:
        rawServerSessionId &&
        !rawServerSessionId.startsWith("anon-") &&
        activeConversation?.messages.length === 0
          ? rawServerSessionId
          : null,
    });
  }
  const serverSessionIdToFetch =
    fetchDecision.sid === rawServerSessionId
      ? fetchDecision.sessionIdToFetch
      : null;
  // GET /api/sessions/{id}: backend lấy danh tính từ JWT Bearer token và tự
  // chọn scope theo loại session (chat-… / personal-…); userId/employeeCode chỉ
  // còn là khoá refetch.
  const employeeCode = user?.employeeCode ?? user?.employee_code ?? "";
  const {
    data: historyMessages,
    loading: historyLoading,
    loadingMore: historyLoadingMore,
    hasMore: hasOlderHistory,
    loadMore: loadOlderHistory,
  } = useAiChatHistory(serverSessionIdToFetch, companyUserId, employeeCode);

  useEffect(() => {
    if (!historyMessages?.length || !activeConversationId) return;
    // Chỉ nạp khi hội thoại đang active thực sự có server session để tải về —
    // tránh nạp lịch sử cũ vào hội thoại mới (chưa có serverSessionId).
    if (!serverSessionIdToFetch) return;
    loadMessagesForConversation(activeConversationId, historyMessages);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyMessages, activeConversationId, serverSessionIdToFetch]);

  const messages = activeConversation?.messages || [];
  const isLoadingHistory = historyLoading && !!serverSessionIdToFetch;

  const userDisplayName = user
    ? user.effectiveDisplayName ||
    user.displayName ||
    user.fullName ||
    user.firstName ||
    user.username
    : undefined;

  const isPersonal = selectedEndpoint === "personal";

  // Reference ổn định — inline arrow sẽ phá React.memo của AiChatPreview/row.
  const handleUpdateMessage = useCallback(
    (msgId: string, patch: Partial<AiMessage>) => {
      if (activeConversationId) updateMessage(activeConversationId, msgId, patch);
    },
    [activeConversationId, updateMessage],
  );

  const handleScrollContainer = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 80;
    // Cuộn gần đỉnh → tải trang lịch sử cũ hơn. Ghi lại chiều cao trước khi
    // prepend để bù scrollTop, giữ nguyên message người dùng đang đọc.
    if (el.scrollTop < 200 && hasOlderHistory && !historyLoadingMore) {
      prependAnchorRef.current = el.scrollHeight - el.scrollTop;
      loadOlderHistory();
    }
  }, [hasOlderHistory, historyLoadingMore, loadOlderHistory]);

  // Bám đáy khi stream, chỉ khi người dùng đang ở gần cuối. Khi vừa prepend
  // lịch sử cũ thì bù scrollTop thay vì nhảy xuống đáy.
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const anchor = prependAnchorRef.current;
    if (anchor !== null) {
      prependAnchorRef.current = null;
      el.scrollTop = el.scrollHeight - anchor;
      return;
    }
    if (!isAtBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

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

      // Đọc từ live store state để tránh stale closure sau khi loadServerSessions chạy
      const liveState = useAiAssistantStore.getState();
      let currentId = liveState.activeConversationId ?? activeConversationId;

      // Tạo conversation mới nếu chưa có hoặc endpoint không khớp
      if (
        !currentId ||
        liveState.conversations.find((c) => c.id === currentId)?.endpoint !==
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
      setPresetPrompt("");
      // User sent a message — always scroll to bottom regardless of current position.
      isAtBottomRef.current = true;
      requestAnimationFrame(() => {
        const el = scrollContainerRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });

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
        // Xả token còn treo trong buffer trước khi ghi đè, nếu không những token
        // của frame cuối sẽ flush SAU và ghi đè mất nội dung final.
        flushStreamBuffer();
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
          const currentConv = useAiAssistantStore.getState().conversations.find((c) => c.id === currentId);
          const serverSessionId = currentConv?.serverSessionId ?? null;

          const request: any = {
            question: trimmed,
            session_id: serverSessionId,
            // new_conversation là bắt buộc theo hợp đồng BE:
            //  - chưa có session_id → true  → BE sinh UUID riêng cho cuộc mới
            //  - đã có session_id   → false → BE ghi tiếp đúng cuộc đó
            new_conversation: !serverSessionId,
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
            signal: controller.signal,
            onSession: (sessionId) => {
              // event: session đến trước token đầu → lưu session_id NGAY để
              // không phụ thuộc event: done (nếu stream lỗi giữa chừng vẫn giữ
              // được id, lần gửi sau ghi tiếp đúng cuộc thay vì tạo cuộc mới).
              if (currentId && sessionId && sessionId !== serverSessionId) {
                updateServerSessionId(currentId, sessionId);
              }
            },
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

          // Cập nhật serverSessionId nếu backend trả về session_id mới.
          // Guard: bỏ qua nếu ID mới chỉ là wrapper của ID cũ (backend double-prefix bug).
          if (
            response.session_id &&
            response.session_id !== serverSessionId &&
            currentId &&
            !(serverSessionId && response.session_id.endsWith(serverSessionId))
          ) {
            updateServerSessionId(currentId, response.session_id);
          }
        }
      } catch (err) {
        // User clicked stop — keep whatever was streamed, don't show error
        if (controller.signal.aborted) {
          finalizeAssistantMessage({ isStreaming: false });
        } else {
          const content = describeApiError(err, t("chat.errorNetwork"));
          // Không ghi đè widget đặc biệt đã render nếu lỗi xảy ra sau onSelectionRequest/onFormRequest
          if (!hasSpecialEvent) {
            finalizeAssistantMessage({ content, isError: true, isStreaming: false });
          } else {
            finalizeAssistantMessage({ isStreaming: false });
          }
          if (usingUpload && fileToSend) {
            toast.error(`Tải lên "${fileToSend.name}" thất bại: ${content}`);
          }
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
      selectedEndpoint,
      user,
      addMessage,
      updateLastMessage,
      updateMessage,
      setThinking,
      createNewConversation,
      updateServerSessionId,
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
  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort("user_stop");
  }, []);

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

        {/* ── Loading: đang tải lịch sử từ server ── */}
        {!hasMessages && isLoadingHistory && (
          <div className="flex flex-1 items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-[#1976D2]" />
              <p className="text-sm text-text-muted">Đang tải lịch sử...</p>
            </div>
          </div>
        )}

        {/* ── Empty state: Hero + Input + Suggestions căn giữa ── */}
        {!hasMessages && !isLoadingHistory && (
          <div className="flex flex-1 items-center justify-center overflow-y-auto px-4">
            <div className="flex w-full max-w-[680px] flex-col items-center gap-8 py-16">
              <AiAssistantHero displayName={userDisplayName} />

              <div className="w-full">
                <AiPromptBox
                  ref={textareaRef}
                  presetValue={presetPrompt}
                  onSubmit={handleSubmit}
                  onStop={handleStop}
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
                    setPresetPrompt(prompt);
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
            <div
              ref={scrollContainerRef}
              onScroll={handleScrollContainer}
              className="flex-1 overflow-y-auto ai-scrollbar"
            >
              {historyLoadingMore && (
                <div className="flex items-center justify-center gap-2 py-3 text-xs text-text-muted">
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-border border-t-[#1976D2]" />
                  Đang tải lịch sử cũ hơn...
                </div>
              )}
              <AiChatPreview
                messages={messages}
                isLoading={isLoading}
                autoScroll={false}
                onUpdateMessage={handleUpdateMessage}
              />
            </div>

            {/* Input sticky bottom */}
            <div className="flex-shrink-0 border-t border-border bg-surface px-4 py-4 sm:px-8 lg:px-12 xl:px-16">
              <div className="w-full">
                <AiPromptBox
                  ref={textareaRef}
                  presetValue={presetPrompt}
                  onSubmit={handleSubmit}
                  onStop={handleStop}
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
