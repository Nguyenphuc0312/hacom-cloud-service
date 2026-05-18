import React, { useState, useCallback } from "react";
import { AiAssistantHero } from "../components/AiAssistantHero";
import { AiPromptBox } from "../components/AiPromptBox";
import { AiSuggestionChips } from "../components/AiSuggestionChips";
import { AiDataSourceCards } from "../components/AiDataSourceCards";
import { AiChatPreview } from "../components/AiChatPreview";
import type { AiChatMessage } from "../components/AiChatPreview";
import { useTranslation } from "react-i18next";

const generateId = () => Math.random().toString(36).slice(2);

export const AiAssistantPage: React.FC = () => {
  const { t } = useTranslation("aiAssistant");
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

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
      setIsLoading(true);

      // Simulate AI response delay (500-800ms)
      await new Promise((resolve) =>
        setTimeout(resolve, 500 + Math.random() * 300),
      );

      const assistantMessage: AiChatMessage = {
        id: generateId(),
        role: "assistant",
        content: t("chat.mockResponse"),
        timestamp: new Date(),
      };

      setIsLoading(false);
      setMessages((prev) => [...prev, assistantMessage]);
    },
    [t],
  );

  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--hc-bg-page)]">
      {/* Page header */}
      <header className="flex min-h-[var(--hc-header-height)] flex-shrink-0 items-center border-b border-border bg-surface px-6">
        <h1 className="text-lg font-semibold text-text-primary">
          {t("page.title")}
        </h1>
      </header>

      {/* Scrollable content */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6">
          {!hasMessages ? (
            <>
              {/* Hero section */}
              <div className="flex pt-4">
                <AiAssistantHero />
              </div>

              {/* Prompt input */}
              <AiPromptBox
                value={inputValue}
                onChange={setInputValue}
                onSubmit={handleSubmit}
                isLoading={isLoading}
              />

              {/* Suggestion chips */}
              <AiSuggestionChips onSelect={handleSubmit} />
            </>
          ) : (
            <>
              {/* Chat history */}
              <div className="flex flex-col gap-6 pt-4">
                <AiChatPreview messages={messages} isLoading={isLoading} />

                {/* Prompt input (below chat) */}
                <AiPromptBox
                  value={inputValue}
                  onChange={setInputValue}
                  onSubmit={handleSubmit}
                  isLoading={isLoading}
                />

                {/* Suggestion chips (below input) */}
                <AiSuggestionChips onSelect={handleSubmit} />
              </div>
            </>
          )}

          {/* Data source cards */}
          <div className="pt-4">
            <AiDataSourceCards />
          </div>
        </div>
      </div>
    </div>
  );
};

export default AiAssistantPage;
