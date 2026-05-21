import React from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { X, Search, Forward } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Conversation, Message } from "../../types";
import { useChatStore } from "../../stores";
import { Avatar } from "../common/Avatar";
import { useForwardMessagesMutation } from "../../features/api/chatApi";
import { toast } from "../ui";

const resolveConvDisplayName = (conv: Conversation): string =>
  conv.displayName || (conv as { name?: string }).name || "Cuộc trò chuyện";

interface ForwardModalProps {
  messages: Message[];
  onClose: () => void;
}

export const ForwardModal: React.FC<ForwardModalProps> = ({
  messages,
  onClose,
}) => {
  const { t } = useTranslation();
  const conversations = useChatStore((s) => s.conversations);
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [forwardMessages, { isLoading }] = useForwardMessagesMutation();

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => {
      const name = resolveConvDisplayName(c).toLowerCase();
      return name.includes(q);
    });
  }, [conversations, query]);

  const toggleSelect = (conversationId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(conversationId)) {
        next.delete(conversationId);
      } else {
        next.add(conversationId);
      }
      return next;
    });
  };

  const handleConfirm = async () => {
    if (selected.size === 0 || messages.length === 0) return;

    const items = messages.flatMap((msg) =>
      Array.from(selected).map((targetConversationId) => ({
        sourceMessageId: msg.id,
        targetConversationId,
      })),
    );

    try {
      await forwardMessages({ items }).unwrap();
      toast.success(
        t("chat:message.forward.success", {
          defaultValue: "Đã chuyển tiếp tin nhắn",
        }),
      );
      onClose();
    } catch {
      toast.error(
        t("chat:message.forward.error", {
          defaultValue: "Không thể chuyển tiếp tin nhắn",
        }),
      );
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label={t("chat:message.forward.title", {
        defaultValue: "Chuyển tiếp tin nhắn",
      })}
    >
      <div
        className="flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-surface shadow-elev4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Forward className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold text-text-primary">
              {t("chat:message.forward.title", {
                defaultValue: "Chuyển tiếp tin nhắn",
              })}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
            aria-label="Đóng"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2">
          <div className="flex items-center gap-2 rounded-lg bg-surface-subtle px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-text-muted" />
            <input
              type="text"
              placeholder={t("chat:message.forward.searchPlaceholder", {
                defaultValue: "Tìm cuộc trò chuyện...",
              })}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
              autoFocus
            />
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto" style={{ maxHeight: "360px" }}>
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-sm text-text-muted">
              {t("chat:message.forward.noConversations", {
                defaultValue: "Không tìm thấy cuộc trò chuyện",
              })}
            </div>
          ) : (
            filtered.map((conv) => {
              const isSelected = selected.has(conv.id);
              const name = resolveConvDisplayName(conv);
              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => toggleSelect(conv.id)}
                  className={clsx(
                    "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
                    isSelected
                      ? "bg-primary/10"
                      : "hover:bg-surface-hover",
                  )}
                >
                  <Avatar
                    src={conv.avatar}
                    alt={name}
                    size="sm"
                  />
                  <span className="flex-1 truncate text-sm text-text-primary">
                    {name}
                  </span>
                  {isSelected && (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary">
                      <svg
                        className="h-3 w-3 text-white"
                        viewBox="0 0 12 12"
                        fill="none"
                      >
                        <path
                          d="M2 6l3 3 5-5"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <span className="text-xs text-text-muted">
            {selected.size > 0
              ? t("chat:message.forward.selectedCount", {
                  count: selected.size,
                  defaultValue: `Đã chọn ${selected.size} cuộc trò chuyện`,
                })
              : t("chat:message.forward.selectHint", {
                  defaultValue: "Chọn cuộc trò chuyện để chuyển tiếp",
                })}
          </span>
          <button
            type="button"
            disabled={selected.size === 0 || isLoading}
            onClick={() => void handleConfirm()}
            className={clsx(
              "rounded-lg px-4 py-1.5 text-sm font-medium transition-colors",
              selected.size > 0 && !isLoading
                ? "bg-primary text-white hover:bg-primary/90"
                : "cursor-not-allowed bg-surface-subtle text-text-muted",
            )}
          >
            {isLoading
              ? t("chat:message.forward.sending", { defaultValue: "Đang gửi..." })
              : t("chat:message.forward.confirm", { defaultValue: "Chuyển tiếp" })}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
