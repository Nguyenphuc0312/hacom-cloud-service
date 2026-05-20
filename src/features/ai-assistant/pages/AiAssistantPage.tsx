import React, { useState, useCallback, useRef, useEffect } from "react";
import { AiAssistantHero } from "../components/AiAssistantHero";
import { AiPromptBox } from "../components/AiPromptBox";
import { AiSuggestionChips } from "../components/AiSuggestionChips";
import { AiChatPreview } from "../components/AiChatPreview";
import { sendAiChatMessage, AiApiError } from "../services/aiChatApi";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../stores/authStore";
import { useAiAssistantStore } from "../state/aiAssistantStore";
import { useChatUiStore } from "../../chat/state/chatUiStore";
import { AiLayout } from "../components/AiLayout";
import { AiChatHeader } from "../components/AiChatHeader";
import type { AiMessage } from "../types";

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Global state
  const {
    conversations,
    activeConversationId,
    addMessage,
    updateLastMessage,
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

  /** Gửi tin nhắn đến AI API */
  const handleSubmit = useCallback(
    async (promptText: string) => {
      const trimmed = promptText.trim();
      if (!trimmed || isLoading) return;

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
        content: trimmed,
        timestamp: new Date(),
      };

      addMessage(currentId, userMessage);
      setInputValue("");
      setIsLoading(true);

      const controller = new AbortController();
      abortControllerRef.current = controller;

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

      try {
        const isCompany = selectedEndpoint === "company";
        const request: any = {
          question: trimmed,
          session_id: currentId || "",
          department: user?.departmentName || "",
        };

        if (isCompany) {
          // Schema cho Công ty
          request.user_id = user?.id || "";
          request.user_name = user?.fullNameFromHR || user?.displayName || user?.username || "";
        } else {
          // Schema cho Cá nhân
          request.employee_code = user?.employeeCode || user?.employee_code || "";
          request.employee_name = user?.fullNameFromHR || user?.displayName || user?.username || "";
        }

        const response = await sendAiChatMessage(request, selectedEndpoint, {
          onToken: (token) => {
            updateLastMessage(currentId!, token, true);
          },
          onThinking: (thinking) => {
            setThinking(currentId!, thinking);
          },
        });

        // Finalize message
        updateLastMessage(currentId, response.answer, false);

        useAiAssistantStore.setState((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === currentId
              ? {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === assistantMessageId
                    ? {
                      ...m,
                      content: response.answer,
                      sources: response.sources,
                      isStreaming: false,
                    }
                    : m,
                ),
              }
              : c,
          ),
        }));
      } catch (err) {
        let content = t("chat.errorNetwork");
        if (err instanceof AiApiError) {
          if (err.kind === "timeout") content = t("chat.errorTimeout");
          if (err.status === 422) content = t("chat.error422");
        }

        updateLastMessage(currentId, content, false);
        useAiAssistantStore.setState((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === currentId
              ? {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, isError: true, isStreaming: false }
                    : m,
                ),
              }
              : c,
          ),
        }));
      } finally {
        setIsLoading(false);
        setTimeout(() => textareaRef.current?.focus(), 0);
      }
    },
    [
      isLoading,
      activeConversationId,
      conversations,
      selectedEndpoint,
      user,
      addMessage,
      updateLastMessage,
      setThinking,
      createNewConversation,
      t,
    ],
  );

  const hasMessages = messages.length > 0;

  // Auto focus input
  useEffect(() => {
    textareaRef.current?.focus();
  }, [activeConversationId]);

  return (
    <AiLayout>
      <div className="flex h-full flex-col overflow-hidden bg-white">
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
              <AiChatPreview messages={messages} isLoading={isLoading} />
            </div>

            {/* Input sticky bottom */}
            <div className="flex-shrink-0 border-t border-gray-100 bg-white px-4 py-4">
              <div className="mx-auto max-w-[768px]">
                <AiPromptBox
                  ref={textareaRef}
                  value={inputValue}
                  onChange={setInputValue}
                  onSubmit={handleSubmit}
                  isLoading={isLoading}
                />
                <p className="mt-2 text-center text-[11px] text-gray-400">
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
