import React from "react";
import { 
  Building2Icon, 
  SparklesIcon, 
  ShieldCheckIcon,
  WifiIcon,
  PanelRightIcon,
  ClockIcon
} from "lucide-react";
import { useChatUiStore } from "../../chat/state/chatUiStore";
import { useAiAssistantStore } from "../state/aiAssistantStore";
import clsx from "clsx";

export const AiChatHeader: React.FC = () => {
  const { selectedEndpoint } = useChatUiStore();
  const { isSourcePanelOpen, toggleSourcePanel, activeConversationId, conversations } = useAiAssistantStore();
  
  const isCompany = selectedEndpoint === "company";
  const activeConversation = conversations.find(c => c.id === activeConversationId);

  return (
    <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-border bg-surface/80 backdrop-blur-md px-6 sticky top-0 z-30">
      {/* Left Interface Status */}
      <div className="flex items-center gap-4">
        <div className={clsx(
          "flex h-10 w-10 items-center justify-center rounded-xl shadow-sm",
          isCompany ? "bg-primary/10 text-primary" : "bg-success/10 text-success"
        )}>
          {isCompany ? <Building2Icon size={20} strokeWidth={2.5} /> : <SparklesIcon size={20} strokeWidth={2.5} />}
        </div>
        
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-black text-text-primary uppercase tracking-tight">
              {isCompany ? "HACOM Knowledge Base" : "Personal AI Assistant"}
            </h2>
            <div className={clsx(
               "flex items-center gap-1 px-2 py-0.5 rounded-full text-[90%] font-bold uppercase tracking-widest",
               isCompany ? "bg-primary/10 text-primary" : "bg-success/10 text-success"
            )}>
               <ShieldCheckIcon size={10} strokeWidth={3} />
               <span>Verified</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-text-muted font-bold uppercase tracking-wider">
             <span className="flex items-center gap-1 text-success">
                <WifiIcon size={10} strokeWidth={3} />
                Connected
             </span>
             <span className="h-1 w-1 rounded-full bg-border" />
             {activeConversation ? (
               <span className="flex items-center gap-1">
                 <ClockIcon size={10} strokeWidth={3} />
                 Updated {new Date(activeConversation.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
               </span>
             ) : (
               <span>Ready to help</span>
             )}
          </div>
        </div>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => toggleSourcePanel()}
          className={clsx(
            "flex h-10 w-10 items-center justify-center rounded-xl transition-all border border-border",
            isSourcePanelOpen 
              ? "bg-primary/10 text-primary border-primary/20 shadow-sm" 
              : "text-text-muted hover:bg-surface-active hover:text-text-primary"
          )}
          title="Tài liệu tham chiếu"
        >
          <PanelRightIcon size={20} strokeWidth={2} />
        </button>
      </div>
    </header>
  );
};
