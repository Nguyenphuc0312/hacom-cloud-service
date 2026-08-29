import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import type { Mention } from "../../types";
import { isOnlyEmoji } from "../../utils/messageHelpers";
import { toast } from "../ui";
import { copyTextToClipboard } from "../../utils/clipboard";
import {
  getCollapsedTextPreview,
  type LongMessageRenderMode,
} from "../../utils/longMessagePolicy";
import { MESSAGE_LINKIFY_MAX_CHARS } from "../../utils/messageLengthPolicy";
import { enrichUserProfile } from "../../services/enrichUserProfile";
import { dispatchMentionProfileView } from "../../features/chat/events/chatUiEvents";
import { buildMentionSegments } from "../../utils/mentionSegments";
import { useResolvedDisplayName } from "../../stores/useResolvedDisplayName";
import { renderShiftCodeText, ShiftCatalogModal } from "./ShiftCodeReference";

// Lazy-load the markdown renderer so the entire react-markdown + unified
// ecosystem is split into a separate async chunk (~100 kB).
const MarkdownContent = React.lazy(() => import("./MarkdownContent"));

interface TextMessageProps {
  content: string;
  contentFormat?: "plain_text" | "markdown" | "rich_text";
  isOwn: boolean;
  currentUsername?: string;
  /**
   * Resolved mention metadata for the message. When provided, drives
   * mention rendering via display-name match — the only path that handles
   * Vietnamese diacritics correctly. Without it, falls back to a Unicode-aware
   * `@<token>` regex so legacy messages still get a styled token.
   */
  mentions?: Mention[];
  currentUserId?: string;
  renderMode?: LongMessageRenderMode;
  isCollapsible?: boolean;
  onToggleExpand?: () => void;
  className?: string;
}

const LOG_LEVEL_REGEX = /(^|\n)\s*(TRACE|DEBUG|INFO|WARN|WARNING|ERROR)\b/m;
const KEY_VALUE_LINE_REGEX = /(^|\n)\s*[\w.-]+\s*[:=]\s*.+/m;
const STRUCTURED_BLOCK_PARSE_MAX_CHARS = 20_000;

const tryFormatJson = (content: string): string | null => {
  const trimmed = content.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) {
    return null;
  }

  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return null;
  }
};

const getStructuredBlockContent = (content: string): string | null => {
  if (content.length > STRUCTURED_BLOCK_PARSE_MAX_CHARS) {
    return null;
  }

  if (!content.includes("\n")) {
    return null;
  }

  const formattedJson = tryFormatJson(content);
  if (formattedJson) {
    return formattedJson;
  }

  if (
    content.includes("```") ||
    LOG_LEVEL_REGEX.test(content) ||
    KEY_VALUE_LINE_REGEX.test(content)
  ) {
    return content.replace(/```[\w-]*\n?/g, "").trim();
  }

  return null;
};

// Legacy messages carry no mention metadata at all. Unicode-aware so Vietnamese
// diacritics are part of the token (plain `\w` was not). Styled but never
// clickable — without metadata there is no userId to open a profile with.
const FALLBACK_MENTION_REGEX = /@[\p{L}\p{N}_.-]+/gu;

interface MentionTokenProps {
  /** The tag exactly as it appears in the message body, including '@'. */
  rawText: string;
  mention?: Mention;
  isSelfMention: boolean;
  isMentionAll: boolean;
}

/**
 * One `@` tag.
 *
 * The label is resolved per-viewer via `useResolvedDisplayName`, so each person
 * sees their own "tên gợi nhớ" (alias) for the tagged user — and, when no alias
 * is set, the user's *current* name rather than the name frozen into the text at
 * send time. The message body itself is untouched: alias never leaves this
 * client, so nothing private leaks to the group.
 */
const MentionToken: React.FC<MentionTokenProps> = ({
  rawText,
  mention,
  isSelfMention,
  isMentionAll,
}) => {
  // Strip the '@' before resolving so we never render "@@Name".
  const rawLabel = rawText.startsWith("@") ? rawText.slice(1) : rawText;
  const resolvedLabel = useResolvedDisplayName(mention?.userId, rawLabel);
  const label = isMentionAll ? rawLabel : resolvedLabel;
  const isClickable = !isMentionAll && Boolean(mention?.userId);

  return (
    <span
      className={clsx(
        "inline rounded px-0.5 font-semibold",
        isMentionAll
          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
          : isSelfMention
            ? // Bị tag chính mình: cùng hệ xanh, nhưng nền đậm hơn tag thường để
              // liếc qua là thấy. Không phân biệt gửi/nhận nữa — cùng lý do bên dưới.
              "bg-[#1976D2]/20 text-[#1565C0] dark:bg-[#60A5FA]/25 dark:text-[#BFDBFE]"
            : // Tag thường: bong bóng GỬI và NHẬN nổi BẰNG NHAU, cùng một màu xanh
              // brand. Trước đây bên gửi ăn theo `--chat-bubble-sent-text` (light
              // mode là gray-900 → tag ra ĐEN) và còn bị hạ alpha nên chìm hẳn vào
              // nền bong bóng. Dark mode nền bong bóng tối nên phải dùng xanh sáng
              // hơn, không thì chữ chìm ngược lại.
              "bg-[#1976D2]/10 text-[#1565C0] dark:bg-[#60A5FA]/15 dark:text-[#93C5FD]",
        isClickable && "cursor-pointer hover:underline",
      )}
      title={mention?.employeeCode || undefined}
      onClick={
        isClickable && mention
          ? (e) => {
              e.stopPropagation();
              dispatchMentionProfileView({
                userId: mention.userId,
                displayName: mention.displayName,
                avatarUrl: mention.avatarUrl,
              });
            }
          : undefined
      }
    >
      @{label}
    </span>
  );
};

// isOwn đã bỏ: tag nay dùng CHUNG một bảng màu cho cả bong bóng gửi và nhận.
const renderWithMentions = (
  text: string,
  options: {
    currentUserId?: string;
    mentions?: Mention[];
    currentUsername?: string;
    isOwn: boolean;
    onShiftCodeSelect: (code: string) => void;
    shiftCodeLabel: (code: string) => string;
  },
): React.ReactNode[] => {
  const {
    currentUserId,
    mentions,
    currentUsername,
    isOwn,
    onShiftCodeSelect,
    shiftCodeLabel,
  } = options;
  const renderPlain = (value: string, key: string) =>
    renderShiftCodeText(value, isOwn, onShiftCodeSelect, shiftCodeLabel, key);

  // No metadata at all: style bare `@token`s so legacy messages still look like
  // mentions, but they stay inert.
  if (!mentions || mentions.length === 0) {
    if (!currentUsername) return renderPlain(text, "plain");
    const out: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let key = 0;
    FALLBACK_MENTION_REGEX.lastIndex = 0;
    while ((match = FALLBACK_MENTION_REGEX.exec(text)) !== null) {
      if (match.index > lastIndex) {
        out.push(
          ...renderPlain(text.slice(lastIndex, match.index), `t-${key++}`),
        );
      }
      const token = match[0];
      const candidate = token.slice(1);
      out.push(
        <MentionToken
          key={`m-${key++}`}
          rawText={token}
          isSelfMention={
            candidate.toLowerCase() === currentUsername.toLowerCase()
          }
          isMentionAll={candidate.toLowerCase() === "all"}
        />,
      );
      lastIndex = match.index + token.length;
    }
    if (lastIndex < text.length) {
      out.push(...renderPlain(text.slice(lastIndex), `t-${key++}`));
    }
    return out.length > 0 ? out : renderPlain(text, "plain");
  }

  const byUserId = new Map(mentions.map((m) => [m.userId, m] as const));
  const segments = buildMentionSegments(text, mentions);

  return segments.map((segment, index) => {
    if (!segment.userId && !segment.isAll) {
      return (
        <React.Fragment key={`t-${index}`}>
          {renderPlain(segment.text, `t-${index}`)}
        </React.Fragment>
      );
    }
    const mention = segment.userId ? byUserId.get(segment.userId) : undefined;
    return (
      <MentionToken
        key={`m-${index}`}
        rawText={segment.text}
        mention={mention}
        isSelfMention={Boolean(
          currentUserId && segment.userId === currentUserId,
        )}
        isMentionAll={Boolean(segment.isAll)}
      />
    );
  });
};

const getMentionsRenderSignature = (mentions?: Mention[]): string =>
  mentions
    ?.map((mention) =>
      [
        mention.userId,
        mention.displayName,
        mention.avatarUrl,
        mention.employeeCode,
      ].join(":"),
    )
    .join("|") ?? "";

const TextMessageComponent: React.FC<TextMessageProps> = ({
  content,
  contentFormat,
  isOwn,
  currentUsername,
  mentions,
  currentUserId,
  renderMode = "expanded",
  isCollapsible = false,
  onToggleExpand,
  className,
}) => {
  // Trigger profile enrichment for all mentioned users so that bad displayNames
  // (emails, employee codes) get replaced with real names from /users/{id}.
  React.useEffect(() => {
    if (!mentions) return;
    for (const m of mentions) {
      if (m.userId && m.userId !== "all") enrichUserProfile(m.userId);
    }
  }, [mentions]);

  const isMarkdown = contentFormat === "markdown";
  const { t } = useTranslation();
  const [selectedShiftCode, setSelectedShiftCode] = React.useState<
    string | null
  >(null);
  const shiftCodeLabel = React.useCallback(
    (code: string) => t("chat:shiftReference.open", { code }),
    [t],
  );
  const displayContent =
    isCollapsible && renderMode === "collapsed"
      ? getCollapsedTextPreview(content)
      : content;
  const structuredBlockContent = getStructuredBlockContent(displayContent);
  const fullStructuredBlockContent =
    getStructuredBlockContent(content) ?? content;
  const onlyEmoji = isOnlyEmoji(displayContent);
  const shouldLinkify =
    displayContent.length <= MESSAGE_LINKIFY_MAX_CHARS &&
    !structuredBlockContent;
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = shouldLinkify
    ? displayContent.split(urlRegex)
    : [displayContent];

  if (isMarkdown && !structuredBlockContent) {
    return (
      <div className="space-y-2">
        <React.Suspense
          fallback={
            <span className="opacity-50 text-sm">{displayContent}</span>
          }
        >
          <MarkdownContent content={displayContent} isOwn={isOwn} />
        </React.Suspense>
        {isCollapsible && onToggleExpand ? (
          <button
            type="button"
            onClick={onToggleExpand}
            className={clsx(
              "text-xs font-semibold underline-offset-2 hover:underline",
              isOwn
                ? "text-[hsl(var(--chat-bubble-sent-text))]"
                : "text-[#1565C0]",
            )}
          >
            {renderMode === "collapsed"
              ? t("chat:message.expandLong", { defaultValue: "Xem them" })
              : t("chat:message.collapseLong", { defaultValue: "Thu gon" })}
          </button>
        ) : null}
      </div>
    );
  }

  if (structuredBlockContent) {
    return (
      <div className="space-y-2">
        <div className="overflow-hidden rounded-xl border border-border/70 bg-surface-overlay/80">
          <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
              {t("chat:message.structuredBlock", {
                defaultValue: "Structured payload",
              })}
            </span>
            <button
              type="button"
              onClick={async () => {
                const copied = await copyTextToClipboard(
                  fullStructuredBlockContent,
                );
                if (copied) {
                  toast.success(
                    t("chat:message.copyFullSuccess", {
                      defaultValue: "Đã sao chép toàn bộ tin nhắn",
                    }),
                  );
                } else {
                  toast.error(
                    t("chat:message.copyFailure", {
                      defaultValue: "Không thể sao chép tin nhắn",
                    }),
                  );
                }
              }}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-text-muted transition-colors hover:text-text-primary"
            >
              <ClipboardDocumentIcon className="h-3.5 w-3.5" />
              {t("chat:message.actions.copy", { defaultValue: "Copy" })}
            </button>
          </div>
          <pre className="max-h-60 overflow-auto overflow-x-hidden whitespace-pre-wrap break-words px-3 py-2 text-[12px] leading-[18px] text-text-secondary [overflow-wrap:anywhere]">
            {structuredBlockContent}
          </pre>
        </div>

        {isCollapsible && onToggleExpand ? (
          <button
            type="button"
            onClick={onToggleExpand}
            className="text-xs font-semibold text-[#1565C0] underline-offset-2 hover:underline"
          >
            {renderMode === "collapsed"
              ? t("chat:message.expandLong", { defaultValue: "Xem them" })
              : t("chat:message.collapseLong", { defaultValue: "Thu gon" })}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        className={clsx(
          "relative",
          isCollapsible &&
            renderMode === "collapsed" &&
            "after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-10 after:bg-gradient-to-t after:from-[hsl(var(--chat-panel-bg))/0.98] after:to-transparent",
        )}
      >
        <p
          className={clsx(
            "chat-message-text max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere]",
            onlyEmoji
              ? "leading-tight text-3xl"
              : clsx(
                  "text-[14px] leading-[21px]",
                  isOwn
                    ? "text-[hsl(var(--chat-bubble-sent-text))]"
                    : "text-text-primary",
                ),
            className,
          )}
        >
          {parts.map((part, index) => {
            const isLink = shouldLinkify && /^https?:\/\/[^\s]+$/i.test(part);
            if (isLink) {
              return (
                <a
                  key={index}
                  href={part}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={clsx(
                    "underline decoration-current underline-offset-2 transition-opacity hover:opacity-80",
                    isOwn
                      ? "text-[hsl(var(--chat-bubble-sent-text))] opacity-90"
                      : "text-[#1565C0]",
                  )}
                >
                  {part}
                </a>
              );
            }

            return (
              <React.Fragment key={index}>
                {renderWithMentions(part, {
                  currentUserId,
                  currentUsername,
                  mentions,
                  isOwn,
                  onShiftCodeSelect: setSelectedShiftCode,
                  shiftCodeLabel,
                })}
              </React.Fragment>
            );
          })}
        </p>
      </div>

      {isCollapsible && onToggleExpand ? (
        <button
          type="button"
          onClick={onToggleExpand}
          className={clsx(
            "text-xs font-semibold underline-offset-2 hover:underline",
            isOwn
              ? "text-[hsl(var(--chat-bubble-sent-text))]"
              : "text-[#1565C0]",
          )}
        >
          {renderMode === "collapsed"
            ? t("chat:message.expandLong", { defaultValue: "Xem them" })
            : t("chat:message.collapseLong", { defaultValue: "Thu gon" })}
        </button>
      ) : null}

      {selectedShiftCode ? (
        <ShiftCatalogModal
          code={selectedShiftCode}
          onClose={() => setSelectedShiftCode(null)}
        />
      ) : null}
    </div>
  );
};

const areEqualTextMessageProps = (
  previous: TextMessageProps,
  next: TextMessageProps,
): boolean =>
  previous.content === next.content &&
  previous.contentFormat === next.contentFormat &&
  previous.isOwn === next.isOwn &&
  previous.currentUsername === next.currentUsername &&
  previous.currentUserId === next.currentUserId &&
  previous.renderMode === next.renderMode &&
  previous.isCollapsible === next.isCollapsible &&
  previous.onToggleExpand === next.onToggleExpand &&
  previous.className === next.className &&
  getMentionsRenderSignature(previous.mentions) ===
    getMentionsRenderSignature(next.mentions);

export const TextMessage = React.memo(
  TextMessageComponent,
  areEqualTextMessageProps,
);

export default TextMessage;
