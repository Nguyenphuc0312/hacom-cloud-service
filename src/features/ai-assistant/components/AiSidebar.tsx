import React, { useState, useMemo } from "react";
import clsx from "clsx";
import { 
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  PinIcon,
  Edit2Icon,
  MessageSquareIcon,
  Building2Icon,
  UserCircle2Icon,
  PinOffIcon
} from "lucide-react";
import { useAiAssistantStore } from "../state/aiAssistantStore";
import { useChatUiStore } from "../../chat/state/chatUiStore";
import { motion } from "framer-motion";
import { format, isToday, isYesterday, subDays, isAfter } from "date-fns";
import { vi } from "date-fns/locale";

export const AiSidebar: React.FC = () => {
  const { 
    conversations, 
    activeConversationId, 
    setActiveConversation, 
    createNewConversation,
    deleteConversation,
    togglePinConversation,
    renameConversation
  } = useAiAssistantStore();

  const { selectedEndpoint, setSelectedEndpoint } = useChatUiStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const activeTab = selectedEndpoint;

  // Grouping logic
  const groupedConversations = useMemo(() => {
    const filtered = conversations.filter(c => 
      c.endpoint === activeTab &&
      (c.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
       c.messages.some(m => m.content.toLowerCase().includes(searchQuery.toLowerCase())))
    );

    const groups: { label: string; items: typeof conversations }[] = [
      { label: "Đã ghim", items: filtered.filter(c => c.isPinned) },
      { label: "Hôm nay", items: filtered.filter(c => !c.isPinned && isToday(new Date(c.updatedAt))) },
      { label: "Hôm qua", items: filtered.filter(c => !c.isPinned && isYesterday(new Date(c.updatedAt))) },
      { label: "7 ngày qua", items: filtered.filter(c => !c.isPinned && !isToday(new Date(c.updatedAt)) && !isYesterday(new Date(c.updatedAt)) && isAfter(new Date(c.updatedAt), subDays(new Date(), 7))) },
      { label: "Cũ hơn", items: filtered.filter(c => !c.isPinned && !isAfter(new Date(c.updatedAt), subDays(new Date(), 7))) },
    ];

    return groups.filter(g => g.items.length > 0);
  }, [conversations, activeTab, searchQuery]);

  const handleStartRename = (e: React.MouseEvent, id: string, title: string) => {
    e.stopPropagation();
    setEditingId(id);
    setEditValue(title);
  };

  const handleSaveRename = (id: string) => {
    if (editValue.trim()) {
      renameConversation(id, editValue.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="flex h-full w-full flex-col bg-surface border-r border-border select-none">
      {/* 1. SaaS Mode Switcher */}
      <div className="p-4 border-b border-border/50">
        <div className="flex p-1 bg-surface-active/50 rounded-2xl border border-border/40">
          <button
            onClick={() => {
              setSelectedEndpoint("company");
              setActiveConversation(null);
            }}
            className={clsx(
              "flex-1 flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-[14px] text-xs font-bold transition-all",
              activeTab === "company" 
                ? "bg-white shadow-sm text-primary ring-1 ring-black/5" 
                : "text-text-muted hover:text-text-primary"
            )}
          >
            <Building2Icon size={16} strokeWidth={2.5} />
            <span>CÔNG TY</span>
          </button>
          <button
            onClick={() => {
              setSelectedEndpoint("personal");
              setActiveConversation(null);
            }}
            className={clsx(
              "flex-1 flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-[14px] text-xs font-bold transition-all",
              activeTab === "personal" 
                ? "bg-white shadow-sm text-success ring-1 ring-black/5" 
                : "text-text-muted hover:text-text-primary"
            )}
          >
            <UserCircle2Icon size={16} strokeWidth={2.5} />
            <span>CÁ NHÂN</span>
          </button>
        </div>
      </div>

      {/* 2. Actions: New Chat & Search */}
      <div className="p-4 space-y-3">
        <button
          onClick={() => createNewConversation(activeTab)}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-black text-white hover:bg-black/80 transition-all text-sm font-bold shadow-lg shadow-black/10 active:scale-[0.98]"
        >
          <PlusIcon size={18} strokeWidth={3} />
          <span>Cuộc hội thoại mới</span>
        </button>

        <div className="relative group">
          <SearchIcon size={16} strokeWidth={2.5} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-primary transition-colors" />
          <input
            type="text"
            placeholder="Tìm kiếm hội thoại..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-surface-active/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          />
        </div>
      </div>

      {/* 3. History List */}
      <div className="flex-1 overflow-y-auto px-2 pb-4 custom-scrollbar">
        <div className="space-y-6">
          {groupedConversations.map((group) => (
            <div key={group.label}>
              <h3 className="px-3 mb-2 text-[10px] font-black uppercase tracking-[0.1em] text-text-muted/60">
                {group.label}
              </h3>
              <div className="space-y-1">
                {group.items.map((conv) => (
                  <motion.div
                    key={conv.id}
                    layoutId={conv.id}
                    onClick={() => setActiveConversation(conv.id)}
                    className={clsx(
                      "group relative flex flex-col gap-0.5 px-3 py-3 rounded-2xl transition-all cursor-pointer border border-transparent",
                      activeConversationId === conv.id 
                        ? "bg-primary/5 border-primary/10 text-primary" 
                        : "text-text-secondary hover:bg-surface-active/60"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <MessageSquareIcon size={16} strokeWidth={2} className={clsx(
                        "shrink-0",
                        activeConversationId === conv.id ? "text-primary" : "text-text-muted opacity-60"
                      )} />
                      
                      {editingId === conv.id ? (
                        <input
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => handleSaveRename(conv.id)}
                          onKeyDown={(e) => e.key === "Enter" && handleSaveRename(conv.id)}
                          className="flex-1 bg-transparent text-sm font-medium outline-none border-b border-primary"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span className="flex-1 truncate text-sm font-medium leading-tight">
                          {conv.title}
                        </span>
                      )}

                      {/* Hover Actions */}
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity translate-x-1">
                        <button 
                          onClick={(e) => { e.stopPropagation(); togglePinConversation(conv.id); }}
                          className="p-1.5 rounded-lg hover:bg-white shadow-sm text-text-muted hover:text-primary transition-colors"
                          title={conv.isPinned ? "Bỏ ghim" : "Ghim"}
                        >
                          {conv.isPinned ? <PinOffIcon size={12} strokeWidth={2.5} /> : <PinIcon size={12} strokeWidth={2.5} />}
                        </button>
                        <button 
                          onClick={(e) => handleStartRename(e, conv.id, conv.title)}
                          className="p-1.5 rounded-lg hover:bg-white shadow-sm text-text-muted hover:text-primary transition-colors"
                          title="Đổi tên"
                        >
                          <Edit2Icon size={12} strokeWidth={2.5} />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                          className="p-1.5 rounded-lg hover:bg-error/10 shadow-sm text-text-muted hover:text-error transition-colors"
                          title="Xóa"
                        >
                          <Trash2Icon size={12} strokeWidth={2.5} />
                        </button>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 ml-7 mt-0.5 opacity-40">
                       <span className="text-[10px] font-medium uppercase tracking-tight">
                         {format(new Date(conv.updatedAt), "HH:mm, dd/MM", { locale: vi })}
                       </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {groupedConversations.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center animate-in fade-in duration-500">
            <div className="h-20 w-20 rounded-3xl bg-surface-active/50 flex flex-col items-center justify-center mb-4 text-text-muted/30 border border-border/30">
              <MessageSquareIcon size={32} strokeWidth={1} />
            </div>
            <p className="text-sm font-bold text-text-primary">Không tìm thấy hội thoại</p>
            <p className="text-xs text-text-muted mt-1 leading-relaxed">Hãy thử tìm từ khóa khác hoặc tạo cuộc trò chuyện mới để bắt đầu.</p>
          </div>
        )}
      </div>

      {/* 4. Footer User Info (Visual only for SAE feeling) */}
      <div className="p-4 border-t border-border/50 bg-surface-active/20">
         <div className="flex items-center gap-3">
            <div className="h-10 w-10 shrink-0">
               <img alt="Hacom Holdings" className="h-full w-full object-contain" src="/logo-dung.png" />
            </div>
            <div className="flex flex-col min-w-0">
               <span className="text-sm font-black text-text-primary truncate uppercase tracking-tighter">Hacom Holdings</span>
               <span className="text-[10px] font-bold text-success flex items-center gap-1 uppercase tracking-widest">
                  <span className="h-1 w-1 rounded-full bg-success animate-pulse" />
                  Hệ thống sẵn sàng
               </span>
            </div>
         </div>
      </div>
    </div>
  );
};
