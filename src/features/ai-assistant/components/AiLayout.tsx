import React from "react";
import { useAiAssistantStore } from "../state/aiAssistantStore";
import { AiSidebar } from "./AiSidebar";
import { AiSourcePanel } from "./AiSourcePanel";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import clsx from "clsx";

interface AiLayoutProps {
  children: React.ReactNode;
}

export const AiLayout: React.FC<AiLayoutProps> = ({ children }) => {
  const { isSidebarOpen, isSourcePanelOpen, toggleSidebar } = useAiAssistantStore();

  return (
    <div className="flex h-full w-full overflow-hidden bg-surface relative font-sans selection:bg-primary/20">
      {/* 1. Left Sidebar */}
      <AnimatePresence initial={false} mode="wait">
        {isSidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 32 }}
            className="flex-shrink-0 z-30 relative overflow-hidden h-full border-r border-border shadow-2xl shadow-black/5"
          >
            <div className="w-[320px] h-full">
              <AiSidebar />
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Sidebar Toggle Floating Button (Minimalist) */}
      <motion.button
        animate={{ left: isSidebarOpen ? 305 : 15 }}
        transition={{ type: "spring", stiffness: 300, damping: 32 }}
        onClick={toggleSidebar}
        className={clsx(
          "absolute top-8 z-50 h-10 w-10 flex items-center justify-center bg-white/80 backdrop-blur border border-border shadow-xl rounded-2xl hover:bg-white hover:scale-110 transition-all",
        )}
      >
        {isSidebarOpen ? <ChevronLeftIcon size={18} strokeWidth={3} /> : <ChevronRightIcon size={18} strokeWidth={3} />}
      </motion.button>

      {/* 2. Main Chat Area */}
      <main className="flex-1 flex flex-col min-w-0 relative h-full bg-white/20">
        {children}
      </main>

      {/* 3. Right Source Panel */}
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
