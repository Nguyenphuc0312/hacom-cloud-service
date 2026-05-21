import React from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { X, Search, Forward, ImageIcon, FileText, Smile, Users, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Conversation, Message } from "../../types";
import { RoomType } from "../../types";
import { useChatStore } from "../../stores";
import { Avatar } from "../common/Avatar";
import { useForwardMessagesMutation } from "../../features/api/chatApi";
import { toast } from "../ui";

type ForwardTab = "recent" | "group" | "direct";

const resolveConvDisplayName = (conv: Conversation): string =>
  conv.displayName || (conv as { name?: string }).name || "Cuộc trò chuyện";

function formatFileSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildMessagePreview(messages: Message[]): React.ReactNode {
  if (messages.length === 0) return null;
  if (messages.length > 1) {
    return (
      <span className="text-sm text-text-muted">
        Đã chọn {messages.length} tin nhắn
      </span>
    );
  }
  const msg = messages[0];
  const hasAttachments = msg.attachments && msg.attachments.length > 0;
  const firstAtt = hasAttachments ? msg.attachments![0] : null;

  if (firstAtt) {
    const att = firstAtt as typeof firstAtt & { url?: string; thumbnailUrl?: string; fileSize?: number; mimeType?: string };
    const isImage =
      (att.type as string) === "image" ||
      (att.mimeType?.startsWith("image/") ?? false);
    const sizeLabel = formatFileSize(att.fileSize);

    if (isImage) {
      const thumb = att.thumbnailUrl ?? att.url;
      return (
        <div className="flex items-center gap-3">
          {thumb ? (
            <img
              src={thumb}
              alt={att.fileName ?? "Hình ảnh"}
              className="h-12 w-12 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-surface-hover">
              <ImageIcon className="h-5 w-5 text-text-muted" />
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-text-primary">
              {att.fileName ?? "Hình ảnh"}
            </p>
            <p className="text-xs text-text-muted">
              Hình ảnh{sizeLabel ? ` · ${sizeLabel}` : ""}
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-surface-hover">
          <FileText className="h-5 w-5 text-text-muted" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-text-primary">
            {att.fileName ?? "Tệp đính kèm"}
          </p>
          <p className="text-xs text-text-muted">
            Tệp{sizeLabel ? ` · ${sizeLabel}` : ""}
          </p>
        </div>
      </div>
    );
  }

  if ((msg.type as string) === "sticker" || (msg.type as string) === "emoji") {
    return (
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-hover">
          <Smile className="h-5 w-5 text-text-muted" />
        </div>
        <p className="text-sm text-text-secondary">Nhãn dán</p>
      </div>
    );
  }

  const text = msg.plainText ?? msg.content ?? "";
  return (
    <p className="line-clamp-2 text-sm text-text-secondary">
      {text || "Tin nhắn"}
    </p>
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
        className="flex w-full max-w-[480px] flex-col overflow-hidden rounded-2xl bg-surface shadow-elev4"
        style={{ maxHeight: "80vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <Forward className="h-4.5 w-4.5 text-primary" />
            <span className="text-base font-semibold text-text-primary">
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

        {/* Message preview */}
        <div className="mx-5 mt-4 shrink-0 rounded-xl border border-border bg-surface-subtle px-4 py-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
            {t("chat:message.forward.preview", {
              defaultValue: "Tin nhắn sẽ chuyển tiếp",
            })}
          </p>
          <div>{buildMessagePreview(messages)}</div>
        </div>

        {/* Search */}
        <div className="shrink-0 px-5 pt-4">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-subtle px-3 py-2.5 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
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

        {/* Tabs */}
        <div className="flex shrink-0 gap-1 px-5 pt-3">
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={clsx(
                "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
                tab === id
                  ? "bg-primary text-white"
                  : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Conversation list */}
        <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
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
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-text-muted">
                      {!isGroup && (
                        <User className="h-3 w-3" />
                      )}
                      {subtitle}
                    </p>
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
        <div className="flex shrink-0 items-center justify-between border-t border-border px-5 py-3.5">
          <span className="text-sm text-text-muted">
            {selected.size > 0
              ? `Đã chọn ${selected.size} người nhận`
              : "Chọn người nhận"}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover"
            >
              {t("common:actions.cancel", { defaultValue: "Hủy" })}
            </button>
            <button
              type="button"
              disabled={selected.size === 0 || isLoading}
              onClick={() => void handleConfirm()}
              className={clsx(
                "rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
                selected.size > 0 && !isLoading
                  ? "bg-primary text-white hover:bg-primary/90"
                  : "cursor-not-allowed bg-surface-subtle text-text-muted",
              )}
            >
              {isLoading
                ? "Đang chuyển tiếp..."
                : "Chuyển tiếp"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};
