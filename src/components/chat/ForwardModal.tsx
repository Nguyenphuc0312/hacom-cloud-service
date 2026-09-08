import React from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { Cloud, Users } from "lucide-react";
import {
  ChevronDownIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import type { Attachment, Conversation, Message } from "../../types";
import { RoomType } from "../../types";
import { useChatStore } from "../../stores";
import { useEnrichedProfileStore } from "../../stores/enrichedProfileStore";
import { enrichUserProfile } from "../../services/enrichUserProfile";
import { isDirectConversation } from "../../lib/conversationAdapter";
import {
  getConversationDisplayName,
  getOtherParticipant,
} from "../../utils/messageHelpers";
import {
  stripHtmlToText,
  shouldTreatMessageContentAsRichText,
} from "../../utils/messageContent.utils";
import { extractFirstUrlFromContent } from "../message/linkPreviewUtils";
import { usePreviewUrl } from "../../hooks";
import {
  formatFileSize,
  getFileIconType,
  getPreviewType,
} from "../../utils/formatFileSize";
import type { FileIconType } from "../../utils/formatFileSize";
import { FileTypeIcon } from "../message/FileTypeIcon";
import { Avatar } from "../common/Avatar";
import { toast } from "../ui";
import { useForwardMessagesMutation } from "../../features/api/chatApi";
import { resolveForwardErrorMessage } from "../../features/chat/forwardErrorMessage";
import { messageApi } from "../../services/api";
import { CLOUD_CONVERSATION_ID } from "../../features/cloud/constants";
import { cloudApi } from "../../features/cloud/api/cloudApi";
import { saveChatMessagesToCloud } from "../../features/cloud/utils/saveChatMessagesToCloud";

type TabKey = "recent" | "groups" | "friends";

interface ForwardModalProps {
  messages: Message[];
  /** Current user id — resolves DM display names correctly. */
  currentUserId: string;
  onClose: () => void;
}

const resolveConvName = (
  conv: Conversation,
  currentUserId: string,
  enrichedNames: Record<string, string>,
): string => {
  // For DMs, prefer the enriched /users/{id} name — same source the sidebar
  // uses so a remembered/HR name shows here too (not the raw original name).
  if (isDirectConversation(conv)) {
    const partnerId = getOtherParticipant(conv, currentUserId)?.id;
    const enriched = partnerId ? enrichedNames[partnerId] : undefined;
    if (enriched) return enriched;
  }
  return (
    getConversationDisplayName(conv, currentUserId) ||
    conv.displayName ||
    conv.name ||
    "Cuộc trò chuyện"
  );
};

/**
 * BE từ chối forward vào hội thoại đang bị chặn gửi (vd DM đã huỷ kết bạn) và
 * throw ngay ở item đầu tiên hỏng, làm hỏng cả lượt chuyển tiếp. Chặn ở đây để
 * người dùng thấy lý do trước khi bấm, thay vì nhận toast lỗi sau đó.
 */
const isForwardBlocked = (conv: Conversation): boolean =>
  Boolean(conv.sendRestriction) || conv.canCurrentUserSend === false;

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

type PreviewLabelKey =
  | "sharing"
  | "sharingFile"
  | "sharingImage"
  | "sharingVideo"
  | "sharingLink";

interface ForwardPreview {
  /** "file" renders the icon/thumbnail + name + size row; others render text. */
  kind: "text" | "file";
  labelKey: PreviewLabelKey;
  /** Primary line: message text, file name, or URL. */
  text: string;
  /** Secondary line for files: formatted size. */
  meta?: string;
  /** Colored file-type icon when there's no thumbnail. */
  iconType?: FileIconType;
  fileName?: string;
  /** Image/video: source conversation + attachment id to fetch a thumbnail. */
  imageSource?: { conversationId: string; attachmentId: string };
}

const PREVIEW_LABEL_DEFAULTS: Record<PreviewLabelKey, string> = {
  sharing: "Chia sẻ tin nhắn",
  sharingFile: "Chia sẻ file",
  sharingImage: "Chia sẻ hình ảnh",
  sharingVideo: "Chia sẻ video",
  sharingLink: "Chia sẻ link",
};

/** Thumbnail for a forwarded image/video, fetched via the same preview
 *  pipeline the timeline uses (server presigned URL, not the inline field). */
const ForwardThumb: React.FC<{
  source: { conversationId: string; attachmentId: string };
  alt: string;
  fallbackIcon: FileIconType;
  fileName?: string;
}> = ({ source, alt, fallbackIcon, fileName }) => {
  const { url } = usePreviewUrl(source.conversationId, source.attachmentId, {
    autoFetch: true,
  });
  const [failed, setFailed] = React.useState(false);
  if (url && !failed) {
    return (
      <img
        src={url}
        alt={alt}
        className="h-full w-full object-cover"
        onError={() => setFailed(true)}
      />
    );
  }
  return <FileTypeIcon type={fallbackIcon} fileName={fileName} variant="tile" />;
};

/**
 * Preview of what's being forwarded, for the strip above the note input.
 * Mirrors Zalo: file → icon/thumbnail + name + size; image → thumbnail.
 */
const buildPreview = (messages: Message[]): ForwardPreview => {
  if (messages.length === 0) {
    return { kind: "text", labelKey: "sharing", text: "" };
  }
  if (messages.length > 1) {
    return {
      kind: "text",
      labelKey: "sharing",
      text: `${messages.length} tin nhắn`,
    };
  }
  const [msg] = messages;
  const attachment: Attachment | undefined = msg.attachments?.[0];
  const rawText =
    typeof msg.content === "string"
      ? msg.content
      : (msg.content as { text?: string } | undefined)?.text ?? "";
  // Content may be rich-text HTML (links, formatting) — show the visible text,
  // not the markup.
  const text = rawText ? stripHtmlToText(rawText) : "";

  if (attachment) {
    const previewType = getPreviewType(attachment.mimeType, attachment.fileName);
    const isImage = previewType === "image";
    const isVideo = previewType === "video";
    return {
      kind: "file",
      labelKey: isImage
        ? "sharingImage"
        : isVideo
          ? "sharingVideo"
          : "sharingFile",
      text: attachment.fileName || "Tệp đính kèm",
      meta: attachment.fileSize ? formatFileSize(attachment.fileSize) : undefined,
      iconType: getFileIconType(attachment.mimeType, attachment.fileName),
      fileName: attachment.fileName,
      imageSource:
        (isImage || isVideo) && msg.conversationId
          ? { conversationId: msg.conversationId, attachmentId: attachment.id }
          : undefined,
    };
  }

  // Link message → show the URL under a "Chia sẻ link" label (like Zalo).
  const isRich = shouldTreatMessageContentAsRichText({
    contentFormat: msg.contentFormat,
    content: rawText,
  });
  const url = extractFirstUrlFromContent(rawText, isRich);
  if (url && (!text.trim() || text.trim() === url)) {
    return { kind: "text", labelKey: "sharingLink", text: url };
  }

  if (text.trim()) {
    return {
      kind: "text",
      labelKey: url ? "sharingLink" : "sharing",
      text: text.trim(),
    };
  }
  return { kind: "text", labelKey: "sharing", text: "[Tin nhắn]" };
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

  const enrichedNames = useEnrichedProfileStore((s) => s.nameByUserId);

  const [tab, setTab] = React.useState<TabKey>("recent");
  const [query, setQuery] = React.useState("");
  const [note, setNote] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [isSavingToCloud, setIsSavingToCloud] = React.useState(false);
  const [forwardMessages, { isLoading }] = useForwardMessagesMutation();

  // Fetch full profiles for DM partners so remembered/HR names show (same as
  // the sidebar). TTL-cached, so re-running on list changes is cheap.
  React.useEffect(() => {
    for (const conv of conversations) {
      if (!isDirectConversation(conv)) continue;
      const partnerId = getOtherParticipant(conv, currentUserId)?.id;
      if (partnerId) enrichUserProfile(partnerId);
    }
  }, [conversations, currentUserId]);

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
      return resolveConvName(c, currentUserId, enrichedNames)
        .toLowerCase()
        .includes(q);
    });
  }, [conversations, tab, query, currentUserId, enrichedNames]);

  const showCloudTarget = React.useMemo(() => {
    if (tab !== "recent") return false;
    const q = query.trim().toLowerCase();
    return !q || "my documents hacom cloud cloud của tôi".includes(q);
  }, [query, tab]);

  // Recent = activity order (as stored). Groups/Friends = alphabetical sections.
  const sections = React.useMemo(() => {
    if (tab === "recent") {
      return [{ letter: "", items: filtered }];
    }
    const byLetter = new Map<string, Conversation[]>();
    for (const conv of filtered) {
      const letter = sectionLetter(
        resolveConvName(conv, currentUserId, enrichedNames),
      );
      const bucket = byLetter.get(letter);
      if (bucket) bucket.push(conv);
      else byLetter.set(letter, [conv]);
    }
    return Array.from(byLetter.entries())
      .sort(([a], [b]) => a.localeCompare(b, "vi"))
      .map(([letter, items]) => ({
        letter,
        items: items.sort((x, y) =>
          resolveConvName(x, currentUserId, enrichedNames).localeCompare(
            resolveConvName(y, currentUserId, enrichedNames),
            "vi",
          ),
        ),
      }));
  }, [filtered, tab, currentUserId, enrichedNames]);

  const preview = React.useMemo(() => buildPreview(messages), [messages]);
  const previewLabel = t(`chat:message.forward.${preview.labelKey}`, {
    defaultValue: PREVIEW_LABEL_DEFAULTS[preview.labelKey],
  });

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
    const includeCloud = selected.has(CLOUD_CONVERSATION_ID);
    const chatTargets = targets.filter(
      (target) => target !== CLOUD_CONVERSATION_ID,
    );
    const items = messages.flatMap((msg) =>
      chatTargets.map((targetConversationId) => ({
        sourceMessageId: msg.id,
        targetConversationId,
      })),
    );

    setIsSavingToCloud(includeCloud);
    try {
      await Promise.all([
        items.length > 0
          ? forwardMessages({ items }).unwrap()
          : Promise.resolve(),
        includeCloud
          ? saveChatMessagesToCloud(messages, currentUserId)
          : Promise.resolve(),
      ]);

      // Optional accompanying note — best effort, doesn't block forward success.
      const trimmedNote = note.trim();
      if (trimmedNote) {
        await Promise.allSettled(
          chatTargets.map((conversationId) =>
            messageApi.sendMessage(conversationId, { content: trimmedNote }),
          ),
        );
        if (includeCloud) {
          await cloudApi.createText(currentUserId, trimmedNote);
        }
      }

      toast.success(
        t("chat:message.forward.success", {
          defaultValue: "Đã chuyển tiếp tin nhắn",
        }),
      );
      onClose();
    } catch (error) {
      toast.error(resolveForwardErrorMessage(error));
    } finally {
      setIsSavingToCloud(false);
    }
  };

  const isSubmitting = isLoading || isSavingToCloud;

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
        className="flex max-h-full w-full max-w-[650px] flex-col overflow-hidden rounded-md bg-surface shadow-elev4"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t("chat:message.forward.title", { defaultValue: "Chia sẻ" })}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-[18px] font-semibold text-text-primary">
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
        <div className="shrink-0 px-5 pb-1 pt-3">
          <div className="flex h-11 items-center gap-2 rounded-md border border-[#1976D2] bg-surface px-3 transition-colors focus-within:ring-2 focus-within:ring-[#1976D2]/15">
            <MagnifyingGlassIcon className="h-5 w-5 shrink-0 text-text-muted" />
            <input
              type="text"
              placeholder={t("chat:message.forward.searchPlaceholder", {
                defaultValue: "Tìm kiếm...",
              })}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none focus:outline-none focus:ring-0"
              autoFocus
            />
          </div>
        </div>

        {/* Tabs */}
        <div
          role="tablist"
          aria-label={t("chat:message.forward.title", { defaultValue: "Chia sẻ" })}
          className="flex shrink-0 items-center gap-5 border-b border-border px-5 pt-2"
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
                  "relative -mb-px border-b-2 pb-3 text-[15px] transition-colors",
                  active
                    ? "border-[#1565C0] font-semibold text-[#1565C0]"
                    : "border-transparent font-medium text-text-muted hover:text-text-primary",
                )}
              >
                {item.label}
              </button>
            );
          })}
          <button
            type="button"
            className="ml-auto -mt-1 inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
          >
            {t("chat:message.forward.filter", { defaultValue: "Phân loại" })}
            <ChevronDownIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Conversation list — height comes from its own content (auto basis), so
            the dialog hugs a short list instead of padding it out. `max-h` caps a
            long one into a scroll area; `min-h-0` + `shrink` keep this the row
            that gives way first when OS scaling 125/150% shortens the viewport,
            so the preview + note + footer never get clipped by `overflow-hidden`.
            Do NOT use flex-1/basis-0 here: the parent is sized by max-h, so there
            is no free space to distribute and the list collapses to 0px. */}
        <div className="min-h-0 max-h-[520px] shrink overflow-y-auto py-3">
          {filtered.length === 0 && !showCloudTarget ? (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center text-sm text-text-muted">
              <MagnifyingGlassIcon className="h-7 w-7 opacity-30" />
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
            <>
              {showCloudTarget ? (
                <button
                  type="button"
                  onClick={() => toggleSelect(CLOUD_CONVERSATION_ID)}
                  className="flex min-h-[58px] w-full items-center gap-3 px-5 py-2 text-left transition-colors hover:bg-surface-hover"
                >
                  <span
                    className={clsx(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                      selected.has(CLOUD_CONVERSATION_ID)
                        ? "border-[#1565C0] bg-[#1565C0]"
                        : "border-border bg-transparent",
                    )}
                    aria-hidden="true"
                  >
                    {selected.has(CLOUD_CONVERSATION_ID) ? (
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
                    ) : null}
                  </span>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#1976D2]/20 bg-[#EFF6FF] text-[#1565C0] dark:bg-[#1565C0]/15">
                    <Cloud className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-text-primary">
                      My Documents
                    </span>
                    <span className="block truncate text-xs text-text-muted">
                      Lưu vào Hacom Cloud
                    </span>
                  </span>
                </button>
              ) : null}
              {sections.map((section) => (
              <div key={section.letter || "recent"}>
                {section.letter && (
                  <div className="sticky top-0 z-[1] bg-surface px-4 pt-1.5 pb-0.5 text-xs font-bold text-text-muted">
                    {section.letter}
                  </div>
                )}
                {section.items.map((conv) => {
                  const isSelected = selected.has(conv.id);
                  const name = resolveConvName(conv, currentUserId, enrichedNames);
                  const isGroup = isGroupConversation(conv);
                  const blocked = isForwardBlocked(conv);
                  return (
                    <button
                      key={conv.id}
                      type="button"
                      disabled={blocked}
                      onClick={() => toggleSelect(conv.id)}
                      className={clsx(
                        "flex min-h-[54px] w-full items-center gap-3 px-5 py-2 text-left transition-colors",
                        blocked
                          ? "cursor-not-allowed opacity-50"
                          : "hover:bg-surface-hover",
                      )}
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
                          <div className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-surface ring-1 ring-border">
                            <Users className="h-2 w-2 text-text-muted" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-medium text-text-primary">
                          {name}
                        </p>
                        {blocked && (
                          <p className="truncate text-xs text-text-muted">
                            {t("chat:message.forward.blocked", {
                              defaultValue: "Không thể gửi tới cuộc trò chuyện này",
                            })}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              ))}
            </>
          )}
        </div>

        {/* Forwarded-message preview + optional note */}
        <div className="shrink-0 border-t border-border px-4 py-2.5">
          <div className="rounded-[10px] border border-border bg-surface-hover px-2.5 py-2">
            <p className="text-xs font-semibold text-text-secondary">
              {previewLabel}
            </p>
            {preview.kind === "file" ? (
              <div className="mt-1.5 flex items-center gap-2.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface ring-1 ring-border">
                  {preview.imageSource ? (
                    <ForwardThumb
                      source={preview.imageSource}
                      alt={preview.text}
                      fallbackIcon={preview.iconType ?? "generic"}
                      fileName={preview.fileName}
                    />
                  ) : (
                    <FileTypeIcon
                      type={preview.iconType ?? "generic"}
                      fileName={preview.fileName}
                      variant="tile"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-text-primary">
                    {preview.text}
                  </p>
                  {preview.meta && (
                    <p className="text-xs text-text-muted">{preview.meta}</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="mt-1 line-clamp-2 text-[13px] text-text-primary">
                {preview.text}
              </p>
            )}
          </div>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("chat:message.forward.notePlaceholder", {
              defaultValue: "Nhập tin nhắn...",
            })}
            className="mt-1.5 w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none transition focus:border-[#1565C0]/60 focus:ring-2 focus:ring-[#1565C0]/20"
          />
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-2.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-surface-subtle px-4 py-1.5 text-sm font-semibold text-text-secondary transition-colors hover:bg-surface-hover"
          >
            {t("common:actions.cancel", { defaultValue: "Hủy" })}
          </button>
          <button
            type="button"
            disabled={selected.size === 0 || isSubmitting}
            onClick={() => void handleConfirm()}
            className={clsx(
              "rounded-lg px-4 py-1.5 text-sm font-semibold text-white transition-colors",
              selected.size > 0 && !isSubmitting
                ? "bg-[#1565C0] hover:bg-[#1976D2]"
                : "cursor-not-allowed bg-[#1565C0]/40",
            )}
          >
            {isSubmitting
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
