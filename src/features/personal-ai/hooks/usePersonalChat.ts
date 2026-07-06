import { useCallback, useEffect, useRef, useState } from "react";
import { streamPersonalChat, PersonalAiError } from "../api/personalAiApi";
import {
  uploadPersonalWeeklyReport,
  AiApiError,
  fetchPersonalSessionMessages,
} from "../../ai-assistant/services/aiChatApi";
import { usePersonalAiStore } from "../stores/personalAiStore";
import { useAuthStore } from "../../../stores/authStore";
import type { PersonalChatMessage, PersonalDocument } from "../types";

const BAOCAOCV_TRIGGER = /^#baocaocv\s*$/i;
const BAOCAOCONGVIEC_TRIGGER = /^#baocaocongviec\s*$/i;
const TONGCVTUAN_TRIGGER = /^#tongcvtuan\s*$/i;
const BARE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function resolveBackendDocumentIds(
  selectedIds: string[],
  documents: PersonalDocument[],
): string[] {
  if (selectedIds.length === 0) return [];

  const selected = new Set(selectedIds);
  const resolved = documents
    .filter((doc) => selected.has(doc.id) || selected.has(doc.document_id))
    .map((doc) => doc.document_id);

  const candidates = resolved.length > 0
    ? resolved
    : selectedIds.filter((id) => !BARE_UUID_RE.test(id));

  return Array.from(new Set(candidates));
}

export function usePersonalChat() {
  const user = useAuthStore((s) => s.user);
  const {
    conversations,
    activeConversationId,
    selectedDocumentIds,
    documents,
    createConversation,
    addMessage,
    appendToken,
    finalizeMessage,
    setMessageThinkingPhase,
    markMessageError,
    patchMessage,
    updateServerSessionId,
    loadMessagesForConversation,
  } = usePersonalAiStore();

  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const fetchedSessionIds = useRef(new Set<string>());

  const activeConversation =
    conversations.find((c) => c.id === activeConversationId) ?? null;
  const messages = activeConversation?.messages ?? [];

  // Fetch messages từ server khi user chọn conversation có serverSessionId nhưng chưa có messages
  useEffect(() => {
    const serverSessionId = activeConversation?.serverSessionId;
    if (!serverSessionId || !activeConversationId) return;
    if ((activeConversation?.messages.length ?? 0) > 0) return;
    if (fetchedSessionIds.current.has(serverSessionId)) return;

    // Backend lấy mã nhân viên từ JWT Bearer token để scope session cá nhân.
    // Chờ tới khi user (đã đăng nhập) sẵn sàng rồi mới fetch; chưa có thì hoãn
    // và đừng đánh dấu đã-fetch để còn retry.
    const employeeCode = user?.employeeCode ?? user?.employee_code ?? "";
    if (!employeeCode) return;

    fetchedSessionIds.current.add(serverSessionId);
    const ac = new AbortController();
    setIsLoadingHistory(true);

    const userId = user?.id ?? "";
    fetchPersonalSessionMessages(serverSessionId, { signal: ac.signal, employeeCode, userId })
      .then((fetched) => {
        if (ac.signal.aborted || !fetched.length) return;
        // Backend trả thêm các role nội bộ của tool-calling:
        // "assistant_tool_call" (content rỗng) và "tool" (kết quả tool). Đây
        // KHÔNG phải tin nhắn hiển thị — nếu giữ lại, kết quả tool hiện nhầm
        // thành tin nhắn và sinh bong bóng rỗng sau khi tải lại. Chỉ lấy
        // user/assistant có nội dung thực.
        const visible = fetched.filter(
          (m) =>
            (m.role === "user" || m.role === "assistant") &&
            (m.content ?? "").trim().length > 0,
        );
        const normalized = visible.map((m, idx) => {
          // Khôi phục hộp "Xem báo cáo công việc" (ReportTextBox) sau khi tải
          // lịch sử: câu trả lời của #baocaocv (user thường) là text báo cáo,
          // không có cờ trong metadata. Nhận diện bằng tin user liền trước là
          // "#baocaocv". Loại trừ báo cáo dạng bảng của admin (có exportable_table).
          const prev = visible[idx - 1];
          const isReportRequest =
            m.role === "assistant" &&
            m.metadata?.exportable_table !== true &&
            prev?.role === "user" &&
            BAOCAOCV_TRIGGER.test((prev.content ?? "").trim());
          return {
            id: m.id || crypto.randomUUID(),
            role: m.role as "user" | "assistant",
            content: m.content,
            timestamp: new Date(m.timestamp),
            isStreaming: false as const,
            thinkingPhase: null as null,
            // Render lại nút "In" cho câu trả lời bảng sau khi tải lịch sử.
            ...(m.metadata?.exportable_table === true && { exportableTable: true }),
            // Render lại hộp báo cáo công việc của #baocaocv.
            ...(isReportRequest && { reportRequest: true as const }),
          };
        });
        if (normalized.length === 0) return;
        loadMessagesForConversation(activeConversationId, normalized);
      })
      .catch(() => { /* Silent — hiển thị empty state làm fallback */ })
      .finally(() => { if (!ac.signal.aborted) setIsLoadingHistory(false); });

    return () => ac.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId, activeConversation?.serverSessionId, user?.employeeCode, user?.employee_code]);

  const sendMessage = useCallback(
    async (promptText: string) => {
      const trimmed = promptText.trim();
      if (!trimmed || isStreaming) return;

      let conversationId = activeConversationId;
      if (!conversationId) {
        conversationId = createConversation();
      }

      const userMessage: PersonalChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
        timestamp: new Date(),
      };
      addMessage(conversationId, userMessage);

      // #baocaocv — KHÔNG chặn ở FE nữa. Để request chạy qua SSE để BE quyết
      // định theo quyền của user:
      //   • Admin/Giám đốc → event `selection_request` → DepartmentSelector
      //   • User thường     → event `token` → nội dung báo cáo của bản thân
      // (xem fe-baocaocv-regular-user-fix.md). Streaming path bên dưới đã xử lý
      // cả `onToken` lẫn `onSelectionRequest`, nên chỉ cần để nó chạy tiếp.

      // #baocaocongviec — KHÔNG dựng form ở FE nữa. Để request stream qua SSE; BE
      // sẽ bắn `form_request` kèm `existing` (prefill chống mất dữ liệu) + cấu hình
      // đính kèm. `onFormRequest` bên dưới patch form vào message. Ở đây chỉ tự động
      // hủy các form còn mở trước đó để tránh nhiều form cùng lúc (lưu trùng).
      if (BAOCAOCONGVIEC_TRIGGER.test(trimmed)) {
        const prevConv = conversations.find((c) => c.id === conversationId);
        prevConv?.messages.forEach((m) => {
          if (m.formRequest) {
            patchMessage(conversationId, m.id, {
              content: "Đã hủy báo cáo.",
              formRequest: undefined,
              isStreaming: false,
            });
          }
        });
      }

      // Detect #tongcvtuan — hiển thị danh sách file báo cáo tuần inline
      // (GET /api/chat/personal/weekly-report/files). Component tự load dữ liệu.
      if (TONGCVTUAN_TRIGGER.test(trimmed)) {
        addMessage(conversationId, {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "",
          timestamp: new Date(),
          isStreaming: false,
          thinkingPhase: null,
          weeklyReportList: true,
        });
        return;
      }

      // #baocaocv — đánh dấu là yêu cầu xem báo cáo. BE quyết định theo quyền:
      //  • Admin/Giám đốc → event `selection_request` → DepartmentSelector
      //  • User thường     → event `token` → nội dung báo cáo của bản thân,
      //    hiển thị trong bordered box "Xem báo cáo công việc".
      const isReportRequest = BAOCAOCV_TRIGGER.test(trimmed);
      const selectedBackendDocumentIds = resolveBackendDocumentIds(
        selectedDocumentIds,
        documents,
      );

      const assistantMessage: PersonalChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        timestamp: new Date(),
        isStreaming: true,
        thinkingPhase:
          isReportRequest || selectedBackendDocumentIds.length > 0
            ? "searching"
            : null,
        ...(isReportRequest && { reportRequest: true }),
      };
      addMessage(conversationId, assistantMessage);

      const controller = new AbortController();
      abortRef.current = controller;
      setIsStreaming(true);

      const convIdSnapshot = conversationId;
      // Lấy serverSessionId của conversation hiện tại (null = chưa có session trên backend)
      const targetConv = conversations.find((c) => c.id === conversationId);
      const serverSessionId = targetConv?.serverSessionId ?? null;
      // Gửi new_conversation: true nếu conversation được tạo mới bằng nút "+"
      // (pendingNew) HOẶC chưa có serverSessionId — belt-and-suspenders đảm bảo
      // backend luôn tạo session riêng biệt thay vì redirect vào session cũ nhất.
      const isNewConversation = (targetConv?.pendingNew ?? false) || !serverSessionId;

      try {
        const response = await streamPersonalChat(
          {
            question: trimmed,
            session_id: serverSessionId,
            ...(isNewConversation && { new_conversation: true }),
            employee_code: user?.employeeCode ?? user?.employee_code ?? "",
            employee_name:
              user?.fullNameFromHr ??
              user?.fullNameFromHR ??
              user?.displayName ??
              user?.username ??
              "",
            department_name: user?.departmentName ?? "",
            org_unit: user?.orgUnit ?? "",
            // Luôn gửi document_ids (mảng rỗng khi bỏ tick hết) để backend
            // chuyển sang chitchat mode thay vì dùng lại RAG context của session.
            document_ids: selectedBackendDocumentIds,
          },
          {
            onToken: (token) => {
              setMessageThinkingPhase(convIdSnapshot, null);
              appendToken(convIdSnapshot, token);
            },
            onThinking: (phase) => {
              setMessageThinkingPhase(convIdSnapshot, phase);
            },
            onFormRequest: (formData) => {
              patchMessage(convIdSnapshot, assistantMessage.id, {
                content: "",
                formRequest: formData,
                isStreaming: false,
                thinkingPhase: null,
              });
            },
            onSelectionRequest: (selectionData) => {
              patchMessage(convIdSnapshot, assistantMessage.id, {
                content: "",
                selectionRequest: selectionData,
                // BE chọn luồng admin → đây là selector, KHÔNG phải report-text.
                // Xóa cờ reportRequest để khi hủy selector không rơi vào
                // ReportTextBox (gây "x2 lần hủy").
                reportRequest: undefined,
                isStreaming: false,
                thinkingPhase: null,
              });
            },
            signal: controller.signal,
          },
        );

        finalizeMessage(convIdSnapshot, response.answer, response.sources);

        // Lưu export_id + session_id nếu BE trả (SSE done) để Excel xuất từ
        // snapshot dữ liệu gốc (đủ cột + có cột "Mã" cho đồng bộ round-trip).
        // Tách khỏi cờ exportable_table: nút Xuất còn hiện qua fallback bảng
        // markdown; nếu chỉ patch id khi exportable_table=true thì mất id khi BE
        // trả id mà không kèm cờ → payload export thiếu session_id/export_id.
        if (response.export_id) {
          patchMessage(convIdSnapshot, assistantMessage.id, {
            exportableTable: true,
            exportId: response.export_id,
            exportSessionId: response.session_id || serverSessionId || undefined,
          });
        } else if (response.exportable_table) {
          patchMessage(convIdSnapshot, assistantMessage.id, {
            exportableTable: true,
          });
        }

        // Cập nhật serverSessionId nếu backend trả về session_id mới.
        // Guard: bỏ qua nếu ID mới chỉ là wrapper của ID cũ (backend double-prefix bug:
        // "personal-X-personal-X-uuid" khi nhận "personal-X-uuid" mà Redis đã hết hạn).
        if (
          response.session_id &&
          response.session_id !== serverSessionId &&
          !(serverSessionId && response.session_id.endsWith(serverSessionId))
        ) {
          updateServerSessionId(convIdSnapshot, response.session_id);
        }
      } catch (err) {
        const content =
          err instanceof PersonalAiError
            ? err.kind === "timeout"
              ? "Yêu cầu quá thời gian. Vui lòng thử lại."
              : err.kind === "network"
                ? "Lỗi kết nối. Vui lòng kiểm tra mạng và thử lại."
                : "Đã xảy ra lỗi. Vui lòng thử lại."
            : "Đã xảy ra lỗi không xác định.";

        finalizeMessage(convIdSnapshot, content);
        markMessageError(convIdSnapshot);
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [
      isStreaming,
      activeConversationId,
      conversations,
      selectedDocumentIds,
      documents,
      user,
      createConversation,
      addMessage,
      appendToken,
      finalizeMessage,
      setMessageThinkingPhase,
      markMessageError,
      patchMessage,
      updateServerSessionId,
    ],
  );

  const sendWithFile = useCallback(
    async (question: string, file: File) => {
      const trimmed = question.trim();
      if (!trimmed || isStreaming) return;

      let conversationId = activeConversationId;
      if (!conversationId) {
        conversationId = createConversation();
      }

      const userMessage: PersonalChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: `[Tệp đính kèm: ${file.name}]\n\n${trimmed}`,
        timestamp: new Date(),
      };
      addMessage(conversationId, userMessage);

      const assistantId = crypto.randomUUID();
      const assistantMessage: PersonalChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
        isStreaming: true,
        thinkingPhase: "searching",
      };
      addMessage(conversationId, assistantMessage);

      const controller = new AbortController();
      abortRef.current = controller;
      setIsStreaming(true);

      const convIdSnapshot = conversationId;
      const targetConvForFile = conversations.find((c) => c.id === conversationId);
      const fileServerSessionId = targetConvForFile?.serverSessionId ?? null;

      try {
        const response = await uploadPersonalWeeklyReport(
          file,
          {
            question: trimmed,
            session_id: fileServerSessionId ?? undefined,
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
          `Đã nhận tệp "${file.name}". Bạn muốn hỏi gì thêm?`;

        const citations = response.sources
          ?.filter((s) => s.document_id != null)
          .map((s) => ({
            document_id: s.document_id!,
            document_name: s.document_name ?? s.source_name ?? s.source_file ?? "",
            page: s.page_number,
            citation_index: s.citation_index,
          }));
        finalizeMessage(convIdSnapshot, answerText, citations);

        if (response.session_id && response.session_id !== fileServerSessionId) {
          updateServerSessionId(convIdSnapshot, response.session_id);
        }
      } catch (err) {
        const content =
          err instanceof AiApiError
            ? err.kind === "timeout"
              ? "Yêu cầu quá thời gian. Vui lòng thử lại."
              : err.kind === "network"
                ? "Lỗi kết nối. Vui lòng kiểm tra mạng và thử lại."
                : err.status === 413
                  ? "Tệp vượt quá dung lượng cho phép của máy chủ."
                  : err.status === 415
                    ? "Định dạng tệp không được hỗ trợ."
                    : "Đã xảy ra lỗi. Vui lòng thử lại."
            : "Đã xảy ra lỗi không xác định.";

        finalizeMessage(convIdSnapshot, content);
        markMessageError(convIdSnapshot);
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [
      isStreaming,
      activeConversationId,
      conversations,
      user,
      createConversation,
      addMessage,
      finalizeMessage,
      markMessageError,
      updateServerSessionId,
    ],
  );

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  return {
    messages,
    isStreaming,
    isLoadingHistory,
    sendMessage,
    sendWithFile,
    stopStreaming,
  };
}
