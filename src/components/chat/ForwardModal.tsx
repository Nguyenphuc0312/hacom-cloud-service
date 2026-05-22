import React from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { X, Search, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Conversation, Message } from "../../types";
import { RoomType } from "../../types";
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
    const base = conversations;

    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter((c) =>
      resolveConvDisplayName(c).toLowerCase().includes(q),
    );
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
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label={t("chat:message.forward.title", {
        defaultValue: "Chuyển tiếp",
      })}
    >
      <div
        className="flex w-full max-w-[440px] flex-col overflow-hidden rounded-2xl bg-surface shadow-elev4"
        style={{ maxHeight: "80vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between px-5 pt-4 pb-3">
          <span className="text-base font-semibold text-text-primary">
            {t("chat:message.forward.title", {
              defaultValue: "Chuyển tiếp",
            })}
          </span>
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
        <div className="shrink-0 px-5 pb-3">
          <div className="flex items-center gap-2 rounded-full bg-surface-subtle px-3.5 py-2">
            <Search className="h-4 w-4 shrink-0 text-text-muted" />
            <input
              type="text"
              placeholder={t("chat:message.forward.searchPlaceholder", {
                defaultValue: "Tìm kiếm người hoặc nhóm",
              })}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
              autoFocus
            />
          </div>
        </div>

        {/* Conversation list */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-sm text-text-muted">
              <Search className="h-8 w-8 opacity-30" />
              <span>
                {t("chat:message.forward.noConversations", {
                  defaultValue: "Không tìm thấy người hoặc nhóm phù hợp",
                })}
              </span>
            </div>
          ) : (
            filtered.map((conv) => {
              const isSelected = selected.has(conv.id);
              const name = resolveConvDisplayName(conv);
              const isGroup =
                conv.type === RoomType.GROUP ||
                conv.type === RoomType.PUBLIC ||
                conv.type === RoomType.CHANNEL;
              const subtitle = isGroup
                ? conv.participantCount
                  ? `${conv.participantCount} thành viên`
                  : "Nhóm"
                : "Cá nhân";
              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => toggleSelect(conv.id)}
                  className={clsx(
                    "flex w-full items-center gap-3 px-5 py-3 text-left transition-colors",
                    isSelected
                      ? "bg-primary/8 dark:bg-primary/12"
                      : "hover:bg-surface-hover",
                  )}
                >
                  <div className="relative shrink-0">
                    <Avatar src={conv.avatar} alt={name} size="sm" />
                    {isGroup && (
                      <div className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-surface ring-1 ring-border">
                        <Users className="h-2.5 w-2.5 text-text-muted" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {name}
                    </p>
                    {isGroup && (
                      <p className="mt-0.5 truncate text-xs text-text-muted">
                        {subtitle}
                      </p>
                    )}
                  </div>
                  <span
                    className={clsx(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                      isSelected
                        ? "border-primary bg-primary"
                        : "border-border bg-transparent",
                    )}
                  >
                    {isSelected && (
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
                    )}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover"
          >
            {t("common:actions.cancel", { defaultValue: "Hủy" })}
          </button>
          <button
            type="button"
            disabled={selected.size === 0 || isLoading}
            onClick={() => void handleConfirm()}
            className={clsx(
              "rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
              selected.size > 0 && !isLoading
                ? "bg-primary text-white hover:bg-primary/90"
                : "cursor-not-allowed bg-surface-subtle text-text-muted",
            )}
          >
            {isLoading
              ? "Đang gửi..."
              : selected.size > 0
                ? `Gửi (${selected.size})`
                : "Gửi"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
