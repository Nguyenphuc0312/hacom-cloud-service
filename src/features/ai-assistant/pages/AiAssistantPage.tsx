import React, { useState, useCallback, useRef } from "react";
import { AiAssistantHero } from "../components/AiAssistantHero";
import { AiPromptBox } from "../components/AiPromptBox";
import { AiSuggestionChips } from "../components/AiSuggestionChips";
import { AiChatPreview } from "../components/AiChatPreview";
import type { AiChatMessage } from "../components/AiChatPreview";
import { getMockResponse } from "../aiMockResponses";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../stores/authStore";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";

const generateId = () => Math.random().toString(36).slice(2);

export const AiAssistantPage: React.FC = () => {
  const { t } = useTranslation("aiAssistant");
  const user = useAuthStore((s) => s.user);
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const userDisplayName = user
    ? (user.effectiveDisplayName || user.displayName || user.fullName || user.firstName || user.username)
    : undefined;

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setInputValue("");
    setIsLoading(false);
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(
    async (prompt: string) => {
      if (!prompt.trim()) return;

      const userMessage: AiChatMessage = {
        id: generateId(),
        role: "user",
        content: prompt,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setInputValue("");

      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }

      setIsLoading(true);

      await new Promise((resolve) => setTimeout(resolve, 700));

      const assistantMessage: AiChatMessage = {
        id: generateId(),
        role: "assistant",
        content: getMockResponse(prompt),
        timestamp: new Date(),
      };

      setIsLoading(false);
      setMessages((prev) => [...prev, assistantMessage]);
    },
    [],
  );

  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--chat-shell-bg)]">
      {/* Mini header — chat state only */}
      {hasMessages && (
        <header className="flex h-12 flex-shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
          <button
            type="button"
            onClick={handleNewChat}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-body-sm text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30"
            aria-label={t("chat.newChat")}
          >
            <ArrowLeftIcon className="h-4 w-4" strokeWidth={1.5} />
            <span>{t("chat.newChat")}</span>
          </button>

          <div className="h-4 w-px bg-border" />

          <span className="text-body-sm font-medium text-text-primary">
            {t("page.title")}
          </span>
        </header>
      )}

      {/* Empty state — centered both axes, max-width 680px */}
      {!hasMessages && (
        <div className="flex flex-1 items-center justify-center overflow-y-auto px-4">
          <div className="flex w-full max-w-[680px] flex-col items-center gap-8 py-12">
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
              <AiSuggestionChips onSelect={(prompt) => {
                setInputValue(prompt);
                setTimeout(() => textareaRef.current?.focus(), 0);
              }} />
            </div>
          </div>
        </div>
      )}

      {/* Chat state — messages scroll independently, input fixed at bottom */}
      {hasMessages && (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto flex max-w-[680px] flex-col gap-6 px-4 py-8">
              <AiChatPreview messages={messages} isLoading={isLoading} />
            </div>
          </div>

          <div className="flex-shrink-0 border-t border-border bg-[var(--chat-shell-bg)] px-4 pb-4 pt-3">
            <AiPromptBox
              ref={textareaRef}
              value={inputValue}
              onChange={setInputValue}
              onSubmit={handleSubmit}
              isLoading={isLoading}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default AiAssistantPage;
