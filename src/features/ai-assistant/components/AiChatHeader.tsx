import React from "react";
import { Building2Icon, SparklesIcon, PanelRightIcon } from "lucide-react";
import { useChatUiStore } from "../../chat/state/chatUiStore";
import { useAiAssistantStore } from "../state/aiAssistantStore";
import clsx from "clsx";

/**
 * Header tối giản kiểu ChatGPT – chỉ hiện model name + toggle source panel.
 */
export const AiChatHeader: React.FC = () => {
  const { selectedEndpoint } = useChatUiStore();
  const { isSourcePanelOpen, toggleSourcePanel } = useAiAssistantStore();

  const isCompany = selectedEndpoint === "company";

  return (
    <header className="flex h-12 flex-shrink-0 items-center justify-between px-4 sticky top-0 z-30 bg-surface border-b border-border">
      {/* Left – Model label */}
      <div className="flex items-center gap-2 px-2 py-1.5">
        <div
          className={clsx(
            "flex h-6 w-6 items-center justify-center rounded-md",
            !isCompany && "bg-success text-white",
          )}
          style={isCompany ? {
            background: "linear-gradient(135deg, #C41E3A 0%, #D32F2F 100%)",
          } : undefined}
        >
          {isCompany ? (
            <Building2Icon size={14} strokeWidth={2.5} />
          ) : (
            <SparklesIcon size={14} strokeWidth={2.5} />
          )}
        </div>
        <span className="text-sm font-semibold text-text-primary">
          {isCompany ? "Hacom AI" : "Trợ lý ảo cá nhân"}
        </span>
      </div>

      {/* Right – Source panel toggle */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => toggleSourcePanel()}
          className={clsx(
            "flex h-8 w-8 items-center justify-center rounded-lg transition-all",
            isSourcePanelOpen
              ? "bg-surface-active text-text-secondary"
              : "text-text-muted hover:bg-surface-hover hover:text-text-secondary",
          )}
          title="Tài liệu tham chiếu"
          aria-label="Toggle source panel"
        >
          <PanelRightIcon size={18} strokeWidth={1.8} />
        </button>
      </div>
    </header>
  );
};
