import { useCallback, useRef, useState } from "react";
import { streamPersonalChat, PersonalAiError } from "../api/personalAiApi";
import {
  uploadPersonalWeeklyReport,
  AiApiError,
} from "../../ai-assistant/services/aiChatApi";
import { usePersonalAiStore } from "../stores/personalAiStore";
import { useAuthStore } from "../../../stores/authStore";
import type { PersonalChatMessage } from "../types";

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
            document_ids:
              selectedDocumentIds.length > 0
                ? selectedDocumentIds
                : undefined,
          },
          {
            onToken: (token) => {
              setMessageThinkingPhase(convIdSnapshot, null);
              appendToken(convIdSnapshot, token);
            },
            onThinking: (phase) => {
              setMessageThinkingPhase(convIdSnapshot, phase);
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

        finalizeMessage(convIdSnapshot, answerText, response.sources);
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
