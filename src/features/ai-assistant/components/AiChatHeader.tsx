import React from "react";
import {
  Building2Icon,
  SparklesIcon,
  PanelRightIcon,
  ChevronDownIcon,
} from "lucide-react";
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
    <header className="flex h-12 flex-shrink-0 items-center justify-between px-4 sticky top-0 z-30 bg-white border-b border-gray-100">
      {/* Left – Model label */}
      <button className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors group">
        <div
          className={clsx(
            "flex h-6 w-6 items-center justify-center rounded-md",
            isCompany
              ? "bg-blue-600 text-white"
              : "bg-emerald-600 text-white",
          )}
        >
          {isCompany ? (
            <Building2Icon size={14} strokeWidth={2.5} />
          ) : (
            <SparklesIcon size={14} strokeWidth={2.5} />
          )}
        </div>
        <span className="text-sm font-semibold text-gray-800">
          {isCompany ? "Hệ thống tri thức nội bộ" : "trợ lý ảo cá nhân"}
        </span>
        <ChevronDownIcon
          size={14}
          className="text-gray-400 group-hover:text-gray-600 transition-colors"
        />
      </button>

      {/* Right – Source panel toggle */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => toggleSourcePanel()}
          className={clsx(
            "flex h-8 w-8 items-center justify-center rounded-lg transition-all",
            isSourcePanelOpen
              ? "bg-gray-200 text-gray-700"
              : "text-gray-400 hover:bg-gray-100 hover:text-gray-600",
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
