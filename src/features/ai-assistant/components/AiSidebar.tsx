import React, { useState, useMemo } from "react";
import clsx from "clsx";
import {
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  PinIcon,
  Edit2Icon,
  MessageSquareIcon,
  UserCircle2Icon,
  PinOffIcon,
} from "lucide-react";
import { useAiAssistantStore } from "../state/aiAssistantStore";
import { useChatUiStore } from "../../chat/state/chatUiStore";
import { useReminderStore } from "../../../stores/reminderStore";
import { useAuthStore } from "../../../stores/authStore";
import aiChatClient from "../../../services/ai-chat/aiChatClient";
import { isToday, isYesterday, subDays, isAfter } from "date-fns";

/**
 * Sidebar trái hiển thị danh sách hội thoại AI, nút tạo mới,
 * tabs chuyển đổi Công ty / Cá nhân – phong cách ChatGPT.
 */
export const AiSidebar: React.FC = () => {
  const {
    conversations,
    activeConversationId,
    setActiveConversation,
    createNewConversation,
    deleteConversation,
    togglePinConversation,
    renameConversation,
  } = useAiAssistantStore();

  const user = useAuthStore((s) => s.user);
  const currentOwnerId = user
    ? (user.employeeCode ?? user.employee_code ?? user.id ?? null)
    : null;

  const { selectedEndpoint, setSelectedEndpoint } = useChatUiStore();
  const hasPendingReminder = useReminderStore((s) => s.hasPendingReminder);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const activeTab = selectedEndpoint;

  /** Nhóm hội thoại theo thời gian */
  const groupedConversations = useMemo(() => {
    const filtered = conversations.filter(
      (c) =>
        c.endpoint === activeTab &&
        (!currentOwnerId || !c.ownerId || c.ownerId === currentOwnerId) &&
        (c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.messages.some((m) =>
            m.content.toLowerCase().includes(searchQuery.toLowerCase()),
          )),
    );

    const groups: { label: string; items: typeof conversations }[] = [
      { label: "Đã ghim", items: filtered.filter((c) => c.isPinned) },
      {
        label: "Hôm nay",
        items: filtered.filter(
          (c) => !c.isPinned && isToday(new Date(c.updatedAt)),
        ),
      },
      {
        label: "Hôm qua",
        items: filtered.filter(
          (c) => !c.isPinned && isYesterday(new Date(c.updatedAt)),
        ),
      },
      {
        label: "7 ngày qua",
        items: filtered.filter(
          (c) =>
            !c.isPinned &&
            !isToday(new Date(c.updatedAt)) &&
            !isYesterday(new Date(c.updatedAt)) &&
            isAfter(new Date(c.updatedAt), subDays(new Date(), 7)),
        ),
      },
      {
        label: "Cũ hơn",
        items: filtered.filter(
          (c) =>
            !c.isPinned &&
            !isAfter(new Date(c.updatedAt), subDays(new Date(), 7)),
        ),
      },
    ];

    return groups.filter((g) => g.items.length > 0);
  }, [conversations, activeTab, searchQuery, currentOwnerId]);

  /** Bắt đầu đổi tên */
  const handleStartRename = (
    e: React.MouseEvent,
    id: string,
    title: string,
  ) => {
    e.stopPropagation();
    setEditingId(id);
    setEditValue(title);
  };

  /** Lưu tên mới */
  const handleSaveRename = (id: string) => {
    if (editValue.trim()) {
      renameConversation(id, editValue.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="flex h-full w-full flex-col bg-surface-overlay border-r border-border select-none">
      {/* ── Header: New chat ── */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <span className="text-xs font-semibold text-text-muted uppercase tracking-wider pl-1">
          Hội thoại
        </span>
        <button
          onClick={() => createNewConversation(activeTab)}
          className="h-8 w-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-active/60 transition-colors"
          aria-label="Tạo cuộc trò chuyện mới"
          title="Tạo mới"
        >
          <PlusIcon size={18} strokeWidth={2} />
        </button>
      </div>

      {/* ── Mode tabs: Công ty / Cá nhân ── */}
      <div className="px-3 mb-2">
        <div className="flex bg-surface-active/60 rounded-lg p-0.5">
          <button
            onClick={() => {
              setSelectedEndpoint("company");
              setActiveConversation(null);
            }}
            className={clsx(
              "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-all",
              activeTab === "company"
                ? "bg-surface shadow-sm text-[#1565C0]"
                : "text-text-muted hover:text-text-secondary",
            )}
          >
            <img src="/Logo_noname.png" alt="HACOM" className="h-4 w-4 object-contain" />
            <span>Công ty</span>
          </button>
          <button
            onClick={() => {
              setSelectedEndpoint("personal");
              setActiveConversation(null);
            }}
            className={clsx(
              "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-all",
              activeTab === "personal"
                ? "bg-surface shadow-sm text-[#1565C0]"
                : "text-text-muted hover:text-text-secondary",
            )}
          >
            <span className="relative">
              <UserCircle2Icon size={14} strokeWidth={2} />
              {hasPendingReminder && (
                <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-[#FFC857] border border-surface-overlay" aria-hidden="true" />
              )}
            </span>
            <span>Cá nhân</span>
          </button>
        </div>
      </div>

      {/* ── Search ── */}
      <div className="px-3 mb-2">
        <div className="relative">
          <SearchIcon
            size={14}
            strokeWidth={2}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            type="text"
            placeholder="Tìm kiếm..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-surface text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-[#1976D2]/15 focus:border-[#1976D2]/60 transition-all"
          />
        </div>
      </div>

      {/* ── Conversation list ── */}
      <div className="flex-1 overflow-y-auto px-2 pb-4 ai-scrollbar">
        <div className="space-y-4">
          {groupedConversations.map((group) => (
            <div key={group.label}>
              <h3 className="px-2 mb-1 text-[11px] font-semibold text-text-disabled uppercase tracking-wide">
                {group.label}
              </h3>
              <div className="space-y-0.5">
                {group.items.map((conv) => (
                  <div
                    key={conv.id}
                    onClick={() => setActiveConversation(conv.id)}
                    className={clsx(
                      "group relative flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all cursor-pointer",
                      activeConversationId === conv.id
                        ? "bg-[#DBEAFE]/10 text-text-primary"
                        : "text-text-secondary hover:bg-surface-hover/40",
                    )}
                  >
                    <MessageSquareIcon
                      size={16}
                      strokeWidth={1.8}
                      className="shrink-0 text-text-muted"
                    />

                    {editingId === conv.id ? (
                      <input
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => handleSaveRename(conv.id)}
                        onKeyDown={(e) =>
                          e.key === "Enter" && handleSaveRename(conv.id)
                        }
                        className="flex-1 bg-transparent text-sm outline-none border-b border-border-strong py-0"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className="flex-1 truncate text-sm leading-snug">
                        {conv.title}
                      </span>
                    )}

                    {/* Hover actions */}
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePinConversation(conv.id);
                        }}
                        className="p-1 rounded hover:bg-surface-active/60 text-text-muted hover:text-text-secondary transition-colors"
                        title={conv.isPinned ? "Bỏ ghim" : "Ghim"}
                      >
                        {conv.isPinned ? (
                          <PinOffIcon size={12} strokeWidth={2} />
                        ) : (
                          <PinIcon size={12} strokeWidth={2} />
                        )}
                      </button>
                      <button
                        onClick={(e) =>
                          handleStartRename(e, conv.id, conv.title)
                        }
                        className="p-1 rounded hover:bg-surface-active/60 text-text-muted hover:text-text-secondary transition-colors"
                        title="Đổi tên"
                      >
                        <Edit2Icon size={12} strokeWidth={2} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (conv.serverSessionId) {
                            aiChatClient.delete(`/api/chat/sessions/${conv.serverSessionId}`).catch(() => {});
                          }
                          deleteConversation(conv.id);
                        }}
                        className="p-1 rounded hover:bg-danger/10 text-text-muted hover:text-danger transition-colors"
                        title="Xóa"
                      >
                        <Trash2Icon size={12} strokeWidth={2} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {groupedConversations.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <MessageSquareIcon
              size={32}
              strokeWidth={1}
              className="text-text-disabled mb-3"
            />
            <p className="text-sm font-medium text-text-muted">
              Chưa có hội thoại
            </p>
            <p className="text-xs text-text-disabled mt-1">
              Bắt đầu bằng cách tạo cuộc trò chuyện mới
            </p>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="p-3 border-t border-border">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 shrink-0">
            <img
              alt="Hacom Holdings"
              className="h-full w-full object-contain"
              src="/logo-dung.png"
            />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-semibold text-text-primary truncate">
              Hacom Holdings
            </span>
            <span className="text-[10px] text-text-muted flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              Sẵn sàng
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
