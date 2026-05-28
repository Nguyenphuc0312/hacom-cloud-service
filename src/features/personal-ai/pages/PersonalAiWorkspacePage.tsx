import React, { useRef, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import { PersonalAiSidebar } from "../components/layout/PersonalAiSidebar";
import { SourceHubPanel } from "../components/source-hub/SourceHubPanel";
import { PersonalChatArea } from "../components/chat/PersonalChatArea";
import { PersonalChatInput } from "../components/chat/PersonalChatInput";
import { PersonalWorkspaceHeader } from "../components/layout/PersonalWorkspaceHeader";
import { usePersonalChat } from "../hooks/usePersonalChat";
import { usePersonalDocuments } from "../hooks/usePersonalDocuments";
import { usePersonalAiStore } from "../stores/personalAiStore";

/**
 * Full-page Personal AI Workspace — NotebookLM-inspired three-panel layout.
 *
 * ┌──────────────┬──────────────────────────────┬──────────────┐
 * │  Sidebar     │       AI Conversation         │  Source Hub  │
 * │  (shared)    │                               │  (RAG mode)  │
 * └──────────────┴──────────────────────────────┴──────────────┘
 */
export const PersonalAiWorkspacePage: React.FC = () => {
  const { messages, isStreaming, sendMessage, stopStreaming } = usePersonalChat();
  const { isRagMode } = usePersonalDocuments();
  const isSourcePanelOpen = usePersonalAiStore((s) => s.isSourcePanelOpen);

  const [inputValue, setInputValue] = React.useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(
    async (text: string) => {
      setInputValue("");
      await sendMessage(text);
      setTimeout(() => textareaRef.current?.focus(), 0);
    },
    [sendMessage],
  );

  const handleSuggestionSelect = useCallback((value: string) => {
    setInputValue(value);
    setTimeout(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      const end = value.length;
      textarea.setSelectionRange(end, end);
    }, 0);
  }, []);

  return (
    <div className="flex h-full w-full overflow-hidden bg-surface font-sans">
      {/* ── Left: Conversation Sidebar ── */}
      <aside className="h-full w-[260px] flex-shrink-0">
        <PersonalAiSidebar />
      </aside>

      {/* ── Center: Chat workspace ── */}
      <main className="flex h-full min-w-0 flex-1 flex-col">
        <PersonalWorkspaceHeader />

        {/* Message timeline */}
        <PersonalChatArea
          messages={messages}
          isStreaming={isStreaming}
          isRagMode={isRagMode}
          onSuggestionSelect={handleSuggestionSelect}
        />

        {/* Sticky input footer */}
        <div className="flex-shrink-0 border-t border-border bg-surface px-4 py-4">
          <div className="mx-auto max-w-[760px]">
            <PersonalChatInput
              ref={textareaRef}
              value={inputValue}
              onChange={setInputValue}
              onSubmit={handleSubmit}
              onStop={stopStreaming}
              isStreaming={isStreaming}
              isRagMode={isRagMode}
            />
          </div>
        </div>
      </main>

      {/* ── Right: Source Hub ── */}
      <AnimatePresence>
        {isSourcePanelOpen && (
          <div className="flex-shrink-0">
            <SourceHubPanel />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PersonalAiWorkspacePage;
