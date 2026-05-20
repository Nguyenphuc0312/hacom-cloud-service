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
import type { AiChatRequest, AiMessage } from "../types";

export const AiAssistantPage: React.FC = () => {
  const { t } = useTranslation("aiAssistant");
  const user = useAuthStore((s) => s.user);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Global state from stores
  const { 
    conversations, 
    activeConversationId, 
    addMessage, 
    updateLastMessage,
    setThinking,
    createNewConversation
  } = useAiAssistantStore();
  const { selectedEndpoint } = useChatUiStore();

  const activeConversation = conversations.find(c => c.id === activeConversationId && c.endpoint === selectedEndpoint);
  const messages = activeConversation?.messages || [];

  const userDisplayName = user
    ? (user.effectiveDisplayName || user.displayName || user.fullName || user.firstName || user.username)
    : undefined;

  // Handle message sending
  const handleSubmit = useCallback(
    async (promptText: string) => {
      const trimmed = promptText.trim();
      if (!trimmed || isLoading) return;

      let currentId = activeConversationId;
      
      // 1. Create a new conversation if none is active or endpoint mismatch
      if (!currentId || (conversations.find(c => c.id === currentId)?.endpoint !== selectedEndpoint)) {
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

      // 2. Prepare assistant placeholder message
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
        const request: AiChatRequest = {
          question: trimmed,
          session_id: currentId,
          department: user?.departmentName || "",
          // Only send relevant fields based on endpoint
          ...(isCompany ? {
            employee_code: user?.employeeCode || user?.employee_code,
            employee_name: user?.fullNameFromHR || user?.displayName || user?.username,
          } : {
            user_id: user?.id,
            user_name: user?.displayName || user?.username,
          })
        };

        const response = await sendAiChatMessage(
          request, 
          selectedEndpoint,
          {
            onToken: (token) => {
              updateLastMessage(currentId!, token, true);
            },
            onThinking: (thinking) => {
              setThinking(currentId!, thinking);
            }
          }
        );

        // Finalize message with sources and full content
        updateLastMessage(currentId, response.answer, false);
        
        useAiAssistantStore.setState((state) => ({
          conversations: state.conversations.map(c => 
            c.id === currentId 
              ? {
                  ...c,
                  messages: c.messages.map(m => 
                    m.id === assistantMessageId 
                      ? { ...m, content: response.answer, sources: response.sources, isStreaming: false }
                      : m
                  )
                }
              : c
          )
        }));

      } catch (err) {
        let content = t("chat.errorNetwork");
        if (err instanceof AiApiError) {
          if (err.kind === "timeout") content = t("chat.errorTimeout");
          if (err.status === 422) content = t("chat.error422");
        }
        
        updateLastMessage(currentId, content, false);
        useAiAssistantStore.setState((state) => ({
          conversations: state.conversations.map(c => 
            c.id === currentId 
              ? {
                  ...c,
                  messages: c.messages.map(m => 
                    m.id === assistantMessageId 
                      ? { ...m, isError: true, isStreaming: false }
                      : m
                  )
                }
              : c
          )
        }));
      } finally {
        setIsLoading(false);
        setTimeout(() => textareaRef.current?.focus(), 0);
      }
    },
    [isLoading, activeConversationId, conversations, selectedEndpoint, user, addMessage, updateLastMessage, setThinking, createNewConversation, t]
  );

  const hasMessages = messages.length > 0;

  // Auto focus input on load or when switching conversations
  useEffect(() => {
    textareaRef.current?.focus();
  }, [activeConversationId]);

  return (
    <AiLayout>
      <div className="flex h-full flex-col overflow-hidden bg-surface/30">
        <AiChatHeader />
        
        {/* Empty state */}
        {!hasMessages && (
          <div className="flex flex-1 items-center justify-center overflow-y-auto px-4 custom-scrollbar">
            <div className="flex w-full max-w-[720px] flex-col items-center gap-12 py-16">
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

        {/* Chat state */}
        {hasMessages && (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <div className="mx-auto flex max-w-[800px] flex-col px-4 py-6">
                <AiChatPreview messages={messages} isLoading={isLoading} />
              </div>
            </div>

            {/* Input fixed at bottom */}
            <div className="flex-shrink-0 bg-gradient-to-t from-[var(--chat-shell-bg)] via-[var(--chat-shell-bg)] to-transparent px-4 pb-6 pt-10">
              <div className="mx-auto max-w-[800px] relative">
                <AiPromptBox
                  ref={textareaRef}
                  value={inputValue}
                  onChange={setInputValue}
                  onSubmit={handleSubmit}
                  isLoading={isLoading}
                />
                
                <p className="mt-3 text-center text-[10px] text-text-muted font-bold uppercase tracking-widest">
                  AI có thể đưa ra câu trả lời sai. Hãy kiểm chứng các thông tin quan trọng.
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
