import { useCallback, useRef, useState } from "react";
import { streamPersonalChat, PersonalAiError } from "../api/personalAiApi";
import {
  uploadPersonalWeeklyReport,
  AiApiError,
  fetchDepartments,
} from "../../ai-assistant/services/aiChatApi";
import { usePersonalAiStore } from "../stores/personalAiStore";
import { useAuthStore } from "../../../stores/authStore";
import type { PersonalChatMessage } from "../types";
import type { DepartmentSelectionRequest } from "../../ai-assistant/types";

const BAOCAOCV_TRIGGER = /^#baocaocv\s*$/i;

export function usePersonalChat() {
  const user = useAuthStore((s) => s.user);
  const {
    conversations,
    activeConversationId,
    selectedDocumentIds,
    createConversation,
    addMessage,
    appendToken,
    finalizeMessage,
    setMessageThinkingPhase,
    markMessageError,
    patchMessage,
  } = usePersonalAiStore();

  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const activeConversation =
    conversations.find((c) => c.id === activeConversationId) ?? null;
  const messages = activeConversation?.messages ?? [];

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

      // Detect #baocaocv — FE tự xử lý, không cần SSE từ backend
      if (BAOCAOCV_TRIGGER.test(trimmed)) {
        const assistantId = crypto.randomUUID();
        const loadingMsg: PersonalChatMessage = {
          id: assistantId,
          role: "assistant",
          content: "",
          timestamp: new Date(),
          isStreaming: true,
          thinkingPhase: "searching",
        };
        addMessage(conversationId, loadingMsg);
        const convIdSnapshot = conversationId;
        try {
          const res = await fetchDepartments();
          const options = (res.departments ?? []).map((d) => ({
            label: d.department,
            value: d.department,
            type: "department",
            company: d.company,
            count: d.count,
          }));
          const selectionData: DepartmentSelectionRequest = {
            selection_type: "department_report",
            title: "Chọn phòng ban/đơn vị để xem báo cáo công việc:",
            options,
            multi_select: true,
            date_range: true,
            fetch_endpoint: "GET /api/work-reports",
          };
          patchMessage(convIdSnapshot, assistantId, {
            content: "",
            selectionRequest: selectionData,
            isStreaming: false,
            thinkingPhase: null,
          });
        } catch {
          patchMessage(convIdSnapshot, assistantId, {
            content: "Không thể tải danh sách phòng ban. Vui lòng thử lại.",
            isStreaming: false,
            thinkingPhase: null,
          });
        }
        return;
      }

      const assistantMessage: PersonalChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        timestamp: new Date(),
        isStreaming: true,
        thinkingPhase: selectedDocumentIds.length > 0 ? "searching" : null,
      };
      addMessage(conversationId, assistantMessage);

      const controller = new AbortController();
      abortRef.current = controller;
      setIsStreaming(true);

      const convIdSnapshot = conversationId;

      try {
        const response = await streamPersonalChat(
          {
            question: trimmed,
            session_id: convIdSnapshot,
            employee_code: user?.employeeCode ?? user?.employee_code ?? "",
            employee_name:
              user?.fullNameFromHr ??
              user?.fullNameFromHR ??
              user?.displayName ??
              user?.username ??
              "",
            department_name: user?.departmentName ?? "",
            org_unit: user?.orgUnit ?? "",
            // Omit document_ids entirely when none selected — sending [] causes
            // some backend builds to still use session RAG context instead of
            // switching to chitchat mode. Omitting the field is the cleaner signal.
            ...(selectedDocumentIds.length > 0 && {
              document_ids: selectedDocumentIds,
            }),
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
                isStreaming: false,
                thinkingPhase: null,
              });
            },
            signal: controller.signal,
          },
        );

        finalizeMessage(convIdSnapshot, response.answer, response.sources);
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
      selectedDocumentIds,
      user,
      createConversation,
      addMessage,
      appendToken,
      finalizeMessage,
      setMessageThinkingPhase,
      markMessageError,
      patchMessage,
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

      try {
        const response = await uploadPersonalWeeklyReport(
          file,
          {
            question: trimmed,
            session_id: convIdSnapshot,
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
      user,
      createConversation,
      addMessage,
      finalizeMessage,
      markMessageError,
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
    sendMessage,
    sendWithFile,
    stopStreaming,
  };
}
