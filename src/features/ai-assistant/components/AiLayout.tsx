import React from "react";
import { useAiAssistantStore } from "../state/aiAssistantStore";
import { AiSidebar } from "./AiSidebar";
import { AiSourcePanel } from "./AiSourcePanel";
import { AnimatePresence } from "framer-motion";
import { PanelLeftIcon } from "lucide-react";
import clsx from "clsx";

interface AiLayoutProps {
  children: React.ReactNode;
}

/**
 * Layout gốc cho AI Assistant – chia 3 vùng: Sidebar | Main | Source Panel.
 * Sidebar có thể toggle đóng/mở, kiểu ChatGPT.
 */
export const AiLayout: React.FC<AiLayoutProps> = ({ children }) => {
  const { isSidebarOpen, isSourcePanelOpen, toggleSidebar } = useAiAssistantStore();

  return (
    <div className="flex h-full w-full overflow-hidden bg-surface relative font-sans">
      {/* ── 1. Left Sidebar ── */}
      <aside
        className={clsx(
          "flex-shrink-0 h-full transition-[width] duration-300 ease-in-out overflow-hidden",
          isSidebarOpen ? "w-[260px]" : "w-0"
        )}
      >
        <div className="w-[260px] h-full">
          <AiSidebar />
        </div>
      </aside>

      {/* Sidebar toggle (visible khi sidebar đóng) */}
      {!isSidebarOpen && (
        <button
          onClick={toggleSidebar}
          className="absolute top-3 left-3 z-50 h-10 w-10 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all"
          aria-label="Mở sidebar"
        >
          <PanelLeftIcon size={20} strokeWidth={1.8} />
        </button>
      )}

      {/* ── 2. Main Chat Area ── */}
      <main className="flex-1 flex flex-col min-w-0 relative h-full bg-surface">
        {children}
      </main>

      {/* ── 3. Right Source Panel ── */}
      <AnimatePresence>
        {isSourcePanelOpen && (
          <div className="flex-shrink-0">
            <AiSourcePanel />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
