import React from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { Users } from "lucide-react";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import type { Conversation, Message } from "../../types";
import { RoomType } from "../../types";
import { useChatStore } from "../../stores";
import { isDirectConversation } from "../../lib/conversationAdapter";
import { getConversationDisplayName } from "../../utils/messageHelpers";
import { Avatar } from "../common/Avatar";
import { toast } from "../ui";
import { useForwardMessagesMutation } from "../../features/api/chatApi";
import { messageApi } from "../../services/api";

type TabKey = "recent" | "groups" | "friends";

interface ForwardModalProps {
  messages: Message[];
  /** Current user id — resolves DM display names correctly. */
  currentUserId: string;
  onClose: () => void;
}

const resolveConvName = (conv: Conversation, currentUserId: string): string =>
  getConversationDisplayName(conv, currentUserId) ||
  conv.displayName ||
  conv.name ||
  "Cuộc trò chuyện";

const isGroupConversation = (conv: Conversation): boolean =>
  conv.type === RoomType.GROUP ||
  conv.type === RoomType.PUBLIC ||
  conv.type === RoomType.CHANNEL;

/**
 * Section letter for alphabetical grouping. Strips Vietnamese diacritics so
 * "Đậu" → "D", "Anh" → "A"; non-letters bucket under "#".
 */
const sectionLetter = (name: string): string => {
  const first = name
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .charAt(0)
    .toUpperCase();
  return /[A-Z]/.test(first) ? first : "#";
};

/**
 * Preview of what's being forwarded, for the strip above the note input.
 * Mirrors Zalo: file messages show the filename under a "Chia sẻ file" label.
 */
const buildPreview = (
  messages: Message[],
): { label: string; text: string } => {
  if (messages.length === 0) return { label: "Chia sẻ tin nhắn", text: "" };
  if (messages.length > 1) {
    return { label: "Chia sẻ tin nhắn", text: `${messages.length} tin nhắn` };
  }
  const [msg] = messages;
  const attachment = msg.attachments?.[0];
  const text =
    typeof msg.content === "string"
      ? msg.content
      : (msg.content as { text?: string } | undefined)?.text ?? "";
  if (attachment?.fileName) {
    return { label: "Chia sẻ file", text: attachment.fileName };
  }
  if (text.trim()) return { label: "Chia sẻ tin nhắn", text: text.trim() };
  if (attachment) return { label: "Chia sẻ tin nhắn", text: "[Tệp đính kèm]" };
  return { label: "Chia sẻ tin nhắn", text: "[Tin nhắn]" };
};

export const ForwardModal: React.FC<ForwardModalProps> = ({
  messages,
  currentUserId,
  onClose,
}) => {
  const { t } = useTranslation();
  // Read from the same index the sidebar uses — the flat `conversations`
  // array can be empty while the index is populated, which left this blank.
  const orderedConversationIds = useChatStore((s) => s.orderedConversationIds);
  const conversationById = useChatStore((s) => s.conversationById);
  const conversations = React.useMemo(
    () =>
      orderedConversationIds
        .map((id) => conversationById[id])
        .filter((c): c is Conversation => Boolean(c)),
    [orderedConversationIds, conversationById],
  );

  const [tab, setTab] = React.useState<TabKey>("recent");
  const [query, setQuery] = React.useState("");
  const [note, setNote] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [forwardMessages, { isLoading }] = useForwardMessagesMutation();

  const tabs: Array<{ id: TabKey; label: string }> = [
    { id: "recent", label: "Gần đây" },
    { id: "groups", label: "Nhóm trò chuyện" },
    { id: "friends", label: "Bạn bè" },
  ];

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter((c) => {
      if (tab === "groups" && !isGroupConversation(c)) return false;
      if (tab === "friends" && !isDirectConversation(c)) return false;
      if (!q) return true;
      return resolveConvName(c, currentUserId).toLowerCase().includes(q);
    });
  }, [conversations, tab, query, currentUserId]);

  // Recent = activity order (as stored). Groups/Friends = alphabetical sections.
  const sections = React.useMemo(() => {
    if (tab === "recent") {
      return [{ letter: "", items: filtered }];
    }
    const byLetter = new Map<string, Conversation[]>();
    for (const conv of filtered) {
      const letter = sectionLetter(resolveConvName(conv, currentUserId));
      const bucket = byLetter.get(letter);
      if (bucket) bucket.push(conv);
      else byLetter.set(letter, [conv]);
    }
    return Array.from(byLetter.entries())
      .sort(([a], [b]) => a.localeCompare(b, "vi"))
      .map(([letter, items]) => ({
        letter,
        items: items.sort((x, y) =>
          resolveConvName(x, currentUserId).localeCompare(
            resolveConvName(y, currentUserId),
            "vi",
          ),
        ),
      }));
  }, [filtered, tab, currentUserId]);

  const preview = React.useMemo(() => buildPreview(messages), [messages]);
  const previewLabel =
    preview.label === "Chia sẻ file"
      ? t("chat:message.forward.sharingFile", { defaultValue: "Chia sẻ file" })
      : t("chat:message.forward.sharing", { defaultValue: "Chia sẻ tin nhắn" });

  const toggleSelect = (conversationId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(conversationId)) next.delete(conversationId);
      else next.add(conversationId);
      return next;
    });
  };

  const handleConfirm = async () => {
    if (selected.size === 0 || messages.length === 0) return;

    const targets = Array.from(selected);
    const items = messages.flatMap((msg) =>
      targets.map((targetConversationId) => ({
        sourceMessageId: msg.id,
        targetConversationId,
      })),
    );

    try {
      await forwardMessages({ items }).unwrap();

      // Optional accompanying note — best effort, doesn't block forward success.
      const trimmedNote = note.trim();
      if (trimmedNote) {
        await Promise.allSettled(
          targets.map((conversationId) =>
            messageApi.sendMessage(conversationId, { content: trimmedNote }),
          ),
        );
      }

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
      className="fixed inset-0 z-modal flex items-center justify-center bg-text-primary/45 p-4"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      role="presentation"
    >
      <div
        className="flex max-h-[min(90vh,40rem)] w-full max-w-[440px] flex-col overflow-hidden rounded-[14px] bg-surface shadow-elev4"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t("chat:message.forward.title", { defaultValue: "Chia sẻ" })}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between px-5 pt-4 pb-2.5">
          <h2 className="text-[17px] font-semibold text-text-primary">
            {t("chat:message.forward.title", { defaultValue: "Chia sẻ" })}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-[30px] w-[30px] items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-subtle hover:text-text-primary"
            aria-label={t("common:actions.close", { defaultValue: "Đóng" })}
          >
            <XMarkIcon className="h-[18px] w-[18px]" />
          </button>
        </div>

        {/* Search */}
        <div className="shrink-0 px-5 pb-1">
          <div className="flex items-center gap-2 rounded-full border border-border bg-surface-hover px-3.5 py-2.5 transition focus-within:border-[#1565C0]/60 focus-within:bg-surface focus-within:ring-2 focus-within:ring-[#1565C0]/20">
            <MagnifyingGlassIcon className="h-4 w-4 shrink-0 text-text-muted" />
            <input
              type="text"
              placeholder={t("chat:message.forward.searchPlaceholder", {
                defaultValue: "Tìm kiếm...",
              })}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
              autoFocus
            />
          </div>
        </div>

        {/* Tabs */}
        <div
          role="tablist"
          aria-label={t("chat:message.forward.title", { defaultValue: "Chia sẻ" })}
          className="flex shrink-0 items-center gap-[22px] border-b border-border px-5 pt-2.5"
        >
          {tabs.map((item) => {
            const active = item.id === tab;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(item.id)}
                className={clsx(
                  "relative -mb-px border-b-2 pb-2.5 text-sm transition-colors",
                  active
                    ? "border-[#1565C0] font-semibold text-[#1565C0]"
                    : "border-transparent font-medium text-text-muted hover:text-text-primary",
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Conversation list */}
        <div className="min-h-[270px] flex-1 overflow-y-auto py-1.5">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-14 text-sm text-text-muted">
              <MagnifyingGlassIcon className="h-8 w-8 opacity-30" />
              <span>
                {query.trim()
                  ? t("chat:message.forward.noConversations", {
                      defaultValue: "Không tìm thấy người hoặc nhóm phù hợp",
                    })
                  : t("chat:message.forward.emptyTab", {
                      defaultValue: "Chưa có cuộc trò chuyện nào",
                    })}
              </span>
            </div>
          ) : (
            sections.map((section) => (
              <div key={section.letter || "recent"}>
                {section.letter && (
                  <div className="sticky top-0 z-[1] bg-surface px-5 pt-1.5 pb-0.5 text-xs font-bold text-text-muted">
                    {section.letter}
                  </div>
                )}
                {section.items.map((conv) => {
                  const isSelected = selected.has(conv.id);
                  const name = resolveConvName(conv, currentUserId);
                  const isGroup = isGroupConversation(conv);
                  return (
                    <button
                      key={conv.id}
                      type="button"
                      onClick={() => toggleSelect(conv.id)}
                      className="flex w-full items-center gap-3 px-5 py-2 text-left transition-colors hover:bg-surface-hover"
                    >
                      <span
                        className={clsx(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                          isSelected
                            ? "border-[#1565C0] bg-[#1565C0]"
                            : "border-border bg-transparent",
                        )}
                        aria-hidden="true"
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
                      <div className="relative shrink-0">
                        <Avatar src={conv.avatar} alt={name} size="md" />
                        {isGroup && (
                          <div className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-surface ring-1 ring-border">
                            <Users className="h-2.5 w-2.5 text-text-muted" />
                          </div>
                        )}
                      </div>
                      <p className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
                        {name}
                      </p>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Forwarded-message preview + optional note */}
        <div className="shrink-0 border-t border-border px-5 py-3">
          <div className="rounded-[10px] bg-surface-subtle px-3 py-2">
            <p className="text-xs font-semibold text-text-secondary">
              {previewLabel}
            </p>
            <p className="mt-0.5 truncate text-[13px] text-text-primary">
              {preview.text}
            </p>
          </div>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("chat:message.forward.notePlaceholder", {
              defaultValue: "Nhập tin nhắn...",
            })}
            className="mt-2 w-full rounded-[10px] border border-border bg-surface px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none transition focus:border-[#1565C0]/60 focus:ring-2 focus:ring-[#1565C0]/20"
          />
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-surface-subtle px-5 py-2 text-sm font-semibold text-text-secondary transition-colors hover:bg-surface-hover"
          >
            {t("common:actions.cancel", { defaultValue: "Hủy" })}
          </button>
          <button
            type="button"
            disabled={selected.size === 0 || isLoading}
            onClick={() => void handleConfirm()}
            className={clsx(
              "rounded-lg px-5 py-2 text-sm font-semibold text-white transition-colors",
              selected.size > 0 && !isLoading
                ? "bg-[#1565C0] hover:bg-[#1976D2]"
                : "cursor-not-allowed bg-[#1565C0]/40",
            )}
          >
            {isLoading
              ? t("common:loading.processing", { defaultValue: "Đang gửi..." })
              : selected.size > 0
                ? `${t("chat:message.forward.confirm", { defaultValue: "Chia sẻ" })} (${selected.size})`
                : t("chat:message.forward.confirm", { defaultValue: "Chia sẻ" })}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ForwardModal;
