import React, { useState, useCallback, useRef } from "react";
import { AiAssistantHero } from "../components/AiAssistantHero";
import { AiPromptBox } from "../components/AiPromptBox";
import { AiSuggestionChips } from "../components/AiSuggestionChips";
import { AiChatPreview } from "../components/AiChatPreview";
import type { AiChatMessage } from "../components/AiChatPreview";
import { sendAiChatMessage, AiApiError } from "../services/aiChatApi";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../stores/authStore";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";

const SESSION_STORAGE_KEY = "ai_assistant_session_id";

function generateId(): string {
  return Math.random().toString(36).slice(2);
}

function readStoredSessionId(): string | null {
  try {
    return localStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistSessionId(id: string | null): void {
  try {
    if (id) {
      localStorage.setItem(SESSION_STORAGE_KEY, id);
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export const AiAssistantPage: React.FC = () => {
  const { t } = useTranslation("aiAssistant");
  const user = useAuthStore((s) => s.user);
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(readStoredSessionId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const userDisplayName = user
    ? (user.effectiveDisplayName || user.displayName || user.fullName || user.firstName || user.username)
    : undefined;

  const updateSessionId = useCallback((id: string | null) => {
    setSessionId(id);
    persistSessionId(id);
  }, []);

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setInputValue("");
    setIsLoading(false);
    updateSessionId(null);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, [updateSessionId]);

  const getErrorMessage = useCallback(
    (err: unknown): string => {
      if (err instanceof AiApiError) {
        if (err.kind === "timeout") return t("chat.errorTimeout");
        if (err.kind === "network") return t("chat.errorNetwork");
        if (err.status === 422) return t("chat.error422");
        if (err.status === 405) return t("chat.error405");
        if (err.status >= 500) return t("chat.error500");
      }
      return t("chat.errorNetwork");
    },
    [t],
  );

  const handleSubmit = useCallback(
    async (prompt: string) => {
      const trimmed = prompt.trim();
      if (!trimmed || isLoading) return;

      const userMessage: AiChatMessage = {
        id: generateId(),
        role: "user",
        content: trimmed,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setInputValue("");

      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }

      setIsLoading(true);

      try {
        const response = await sendAiChatMessage(trimmed, sessionId);

        if (response.session_id) {
          updateSessionId(response.session_id);
        }

        const assistantMessage: AiChatMessage = {
          id: generateId(),
          role: "assistant",
          content: response.answer,
          timestamp: new Date(),
          sources: response.sources?.length > 0 ? response.sources : undefined,
        };

        setMessages((prev) => [...prev, assistantMessage]);
      } catch (err) {
        const errorMessage: AiChatMessage = {
          id: generateId(),
          role: "assistant",
          content: getErrorMessage(err),
          timestamp: new Date(),
          error: true,
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsLoading(false);
        setTimeout(() => textareaRef.current?.focus(), 0);
      }
    },
    [isLoading, sessionId, updateSessionId, getErrorMessage],
  );

  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--chat-shell-bg)]">
      {/* Mini header — shown only when chat is active */}
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

      {/* Empty state */}
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

      {/* Chat state — messages scroll independently, input fixed at bottom */}
      {hasMessages && (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto flex max-w-[680px] flex-col gap-6 px-4 py-8">
              <AiChatPreview messages={messages} isLoading={isLoading} />
            </div>
          </div>

          <div className="flex-shrink-0 border-t border-border bg-[var(--chat-shell-bg)] px-4 pb-4 pt-3">
            <div className="mx-auto max-w-[680px]">
              <AiPromptBox
                ref={textareaRef}
                value={inputValue}
                onChange={setInputValue}
                onSubmit={handleSubmit}
                isLoading={isLoading}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AiAssistantPage;
