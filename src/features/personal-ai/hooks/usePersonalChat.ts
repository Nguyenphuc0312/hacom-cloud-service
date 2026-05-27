import { useCallback, useRef, useState } from "react";
import { streamPersonalChat, PersonalAiError } from "../api/personalAiApi";
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
              user?.fullNameFromHR ?? user?.displayName ?? user?.username ?? "",
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

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  return {
    messages,
    isStreaming,
    sendMessage,
    stopStreaming,
  };
}
