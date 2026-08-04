import React from "react";
import { useAiAssistantStore } from "../state/aiAssistantStore";
import { AiSidebar } from "./AiSidebar";
import { AiSourcePanel } from "./AiSourcePanel";
import { AnimatePresence } from "framer-motion";

interface AiLayoutProps {
  children: React.ReactNode;
}

export const AiLayout: React.FC<AiLayoutProps> = ({ children }) => {
  const { isSourcePanelOpen } = useAiAssistantStore();

  return (
    <div className="flex h-full w-full overflow-hidden bg-surface font-sans">
      {/* ── 1. Left Sidebar – luôn hiển thị ── */}
      <aside className="flex-shrink-0 w-[260px] h-full">
        <AiSidebar />
      </aside>

      {/* ── 2. Main Chat Area ── */}
      <main className="flex-1 flex flex-col min-w-0 h-full bg-surface">
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
