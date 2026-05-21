import React from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { X, Search, Forward, ImageIcon, FileText, Smile } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Conversation, Message } from "../../types";
import { useChatStore } from "../../stores";
import { Avatar } from "../common/Avatar";
import { useForwardMessagesMutation } from "../../features/api/chatApi";
import { toast } from "../ui";

type ForwardTab = "recent" | "group" | "direct";

const resolveConvDisplayName = (conv: Conversation): string =>
  conv.displayName || (conv as { name?: string }).name || "Cuộc trò chuyện";

function buildMessagePreview(messages: Message[]): React.ReactNode {
  if (messages.length === 0) return null;
  if (messages.length > 1) {
    return (
      <span className="text-text-muted">
        {messages.length} tin nhắn được chọn
      </span>
    );
  }
  const msg = messages[0];
  const hasAttachments = msg.attachments && msg.attachments.length > 0;
  const firstAtt = hasAttachments ? msg.attachments![0] : null;

  if (firstAtt) {
    const isImage =
      firstAtt.type === "image" ||
      (firstAtt.mimeType?.startsWith("image/") ?? false);
    if (isImage) {
      return (
        <span className="flex items-center gap-1.5 text-text-muted">
          <ImageIcon className="h-3.5 w-3.5 shrink-0" />
          <span>
            {firstAtt.fileName ??
              (msg.attachments!.length > 1
                ? `${msg.attachments!.length} hình ảnh`
                : "Hình ảnh")}
          </span>
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1.5 text-text-muted">
        <FileText className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">
          {firstAtt.fileName ?? "Tệp đính kèm"}
        </span>
      </span>
    );
  }

  if ((msg.type as string) === "sticker" || (msg.type as string) === "emoji") {
    return (
      <span className="flex items-center gap-1.5 text-text-muted">
        <Smile className="h-3.5 w-3.5 shrink-0" />
        <span>Nhãn dán</span>
      </span>
    );
  }

  const text = msg.plainText ?? msg.content ?? "";
  return (
    <span className="truncate text-text-secondary">
      {text.length > 60 ? text.slice(0, 57) + "..." : text || "Tin nhắn"}
    </span>
  );
}

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
  const [tab, setTab] = React.useState<ForwardTab>("recent");
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [forwardMessages, { isLoading }] = useForwardMessagesMutation();

  const filtered = React.useMemo(() => {
    const base =
      tab === "group"
        ? conversations.filter((c) => c.type === "group")
        : tab === "direct"
          ? conversations.filter((c) => c.type === "direct")
          : conversations;

    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter((c) =>
      resolveConvDisplayName(c).toLowerCase().includes(q),
    );
  }, [conversations, query, tab]);

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

  const tabs: { id: ForwardTab; label: string }[] = [
    {
      id: "recent",
      label: t("chat:message.forward.tabRecent", { defaultValue: "Gần đây" }),
    },
    {
      id: "group",
      label: t("chat:message.forward.tabGroup", {
        defaultValue: "Nhóm trò chuyện",
      }),
    },
    {
      id: "direct",
      label: t("chat:message.forward.tabDirect", {
        defaultValue: "Bạn bè",
      }),
    },
  ];

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
        className="flex w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-surface shadow-elev4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Forward className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-text-primary">
              {t("chat:message.forward.title", {
                defaultValue: "Chuyển tiếp",
              })}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
            aria-label="Đóng"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Message preview */}
        <div className="mx-4 mt-3 flex items-start gap-2.5 rounded-xl bg-surface-subtle px-3 py-2.5">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Forward className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="mb-0.5 text-xs font-medium text-text-muted">
              {t("chat:message.forward.preview", {
                defaultValue: "Nội dung chuyển tiếp",
              })}
            </p>
            <div className="text-xs">{buildMessagePreview(messages)}</div>
          </div>
        </div>

        {/* Search */}
        <div className="px-4 pt-3">
          <div className="flex items-center gap-2 rounded-lg bg-surface-subtle px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-text-muted" />
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

        {/* Tabs */}
        <div className="flex gap-1 px-4 pt-2">
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={clsx(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                tab === id
                  ? "bg-primary text-white"
                  : "text-text-muted hover:bg-surface-hover hover:text-text-primary",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Conversation list */}
        <div className="mt-1 overflow-y-auto" style={{ maxHeight: "280px" }}>
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
                    "flex w-full items-center gap-3 px-4 py-2 text-left transition-colors",
                    isSelected ? "bg-primary/8" : "hover:bg-surface-hover",
                  )}
                >
                  <Avatar src={conv.avatar} alt={name} size="sm" />
                  <span className="flex-1 truncate text-sm text-text-primary">
                    {name}
                  </span>
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
        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <span className="text-xs text-text-muted">
            {selected.size > 0
              ? t("chat:message.forward.selectedCount", {
                  count: selected.size,
                  defaultValue: `Đã chọn ${selected.size}`,
                })
              : t("chat:message.forward.selectHint", {
                  defaultValue: "Chọn người nhận",
                })}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover"
            >
              {t("common:actions.cancel", { defaultValue: "Hủy" })}
            </button>
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
                ? t("chat:message.forward.sending", {
                    defaultValue: "Đang gửi...",
                  })
                : t("chat:message.forward.confirm", {
                    defaultValue: "Chuyển tiếp",
                  })}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};
