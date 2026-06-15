import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import type { Mention } from "../../types";
import { isOnlyEmoji } from "../../utils/messageHelpers";
import { toast } from "../ui";
import {
  getCollapsedTextPreview,
  type LongMessageRenderMode,
} from "../../utils/longMessagePolicy";
import { MESSAGE_LINKIFY_MAX_CHARS } from "../../utils/messageLengthPolicy";
import { useEnrichedProfileStore } from "../../stores/enrichedProfileStore";
import { enrichUserProfile } from "../../services/enrichUserProfile";
import { dispatchMentionProfileView } from "../../features/chat/events/chatUiEvents";

// Lazy-load the markdown renderer so the entire react-markdown + unified
// ecosystem is split into a separate async chunk (~100 kB).
const MarkdownContent = React.lazy(
  () => import("./MarkdownContent"),
);

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

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Build an alternation regex from resolved mention displayNames.
 * Matches longest-first to avoid "@An" eating part of "@An Nguyen".
 * Returns null when there are no usable mentions.
 */
const buildMentionRegexFromMetadata = (mentions: Mention[]): RegExp | null => {
  const names = mentions
    .map((m) => m.displayName?.trim())
    .filter((name): name is string => Boolean(name));
  if (names.length === 0) return null;

  const sorted = [...new Set(names)].sort((a, b) => b.length - a.length);
  const alternation = sorted.map(escapeRegExp).join("|");
  return new RegExp(`@(?:${alternation})`, "gu");
};

// Unicode-aware fallback for legacy messages without mention metadata.
// Matches `@<token>` where token is letters / digits / Vietnamese diacritics
// (the original `\w` alternative did not). Used only when `mentions[]` is
// missing — the metadata path is preferred.
const FALLBACK_MENTION_REGEX = /@[\p{L}\p{N}_.-]+/gu;

const renderWithMentions = (
  text: string,
  isOwn: boolean,
  options: {
    currentUserId?: string;
    mentions?: Mention[];
    currentUsername?: string;
    enrichedNames?: Record<string, string>;
  },
): React.ReactNode[] => {
  const { currentUserId, mentions, currentUsername, enrichedNames } = options;

  const fromMetadata = mentions && mentions.length > 0;
  const regex = fromMetadata
    ? buildMentionRegexFromMetadata(mentions)
    : currentUsername || mentions
      ? FALLBACK_MENTION_REGEX
      : null;

  if (!regex) return [text];

  // Build a lookup by displayName to resolve userId for self-mention check.
  const byName = new Map<string, Mention>();
  if (mentions) {
    for (const m of mentions) {
      if (m.displayName) byName.set(m.displayName.toLowerCase(), m);
    }
  }

  const out: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  regex.lastIndex = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      out.push(
        <React.Fragment key={`t-${key++}`}>
          {text.slice(lastIndex, match.index)}
        </React.Fragment>,
      );
    }
    const token = match[0];
    const candidate = token.startsWith("@") ? token.slice(1) : token;
    const resolved = byName.get(candidate.toLowerCase());
    const isSelfMention = resolved
      ? Boolean(currentUserId && resolved.userId === currentUserId)
      : Boolean(
          currentUsername &&
            candidate.toLowerCase() === currentUsername.toLowerCase(),
        );
    const isMentionAll = resolved?.userId === "all" || candidate.toLowerCase() === "all";
    // Prefer enriched name from profile store over raw API displayName
    const enrichedLabel =
      resolved?.userId && enrichedNames
        ? enrichedNames[resolved.userId]
        : undefined;
    const displayLabel = enrichedLabel
      ? `@${enrichedLabel}`
      : token;
    out.push(
      <span
        key={`m-${key++}`}
        className={clsx(
          "inline rounded px-0.5 font-semibold",
          isMentionAll
            ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
            : isSelfMention
              ? isOwn
                ? "bg-[hsl(var(--chat-bubble-sent-text))/0.2] text-[hsl(var(--chat-bubble-sent-text))]"
                : "bg-[#1976D2]/10 text-[#1565C0]"
              : isOwn
                ? "text-[hsl(var(--chat-bubble-sent-text))/0.95]"
                : "text-[#1565C0]/80",
          !isMentionAll && resolved?.userId && "cursor-pointer hover:underline",
        )}
        title={resolved?.employeeCode || undefined}
        onClick={
          !isMentionAll && resolved?.userId
            ? (e) => {
                e.stopPropagation();
                dispatchMentionProfileView({
                  userId: resolved.userId,
                  displayName: resolved.displayName,
                  avatarUrl: resolved.avatarUrl,
                });
              }
            : undefined
        }
      >
        {displayLabel}
      </span>,
    );
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) {
    out.push(
      <React.Fragment key={`t-${key++}`}>{text.slice(lastIndex)}</React.Fragment>,
    );
  }
  return out;
};

export const TextMessage: React.FC<TextMessageProps> = ({
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

  const mentionUserIds = React.useMemo(
    () => (mentions ?? []).map((m) => m.userId).filter(Boolean),
    [mentions],
  );
  // Select the whole nameByUserId map (stable reference — only replaced when a new
  // profile is added) then derive enrichedNames in useMemo. Avoid a selector that
  // returns a new object on every call, which would cause an infinite Zustand loop.
  const nameByUserId = useEnrichedProfileStore((s) => s.nameByUserId);
  const enrichedNames = React.useMemo(() => {
    if (mentionUserIds.length === 0) return undefined;
    const result: Record<string, string> = {};
    for (const uid of mentionUserIds) {
      const name = nameByUserId[uid];
      if (name) result[uid] = name;
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }, [nameByUserId, mentionUserIds]);

  const isMarkdown = contentFormat === "markdown";
  const { t } = useTranslation();
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
        <React.Suspense fallback={<span className="opacity-50 text-sm">{displayContent}</span>}>
          <MarkdownContent content={displayContent} isOwn={isOwn} />
        </React.Suspense>
        {isCollapsible && onToggleExpand ? (
          <button
            type="button"
            onClick={onToggleExpand}
            className={clsx(
              "text-xs font-semibold underline-offset-2 hover:underline",
              isOwn ? "text-[hsl(var(--chat-bubble-sent-text))]" : "text-[#1565C0]",
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
              onClick={() => {
                void navigator.clipboard.writeText(fullStructuredBlockContent);
                toast.success(
                  t("chat:message.copyFullSuccess", {
                    defaultValue: "Đã sao chép toàn bộ tin nhắn",
                  }),
                );
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
                  isOwn ? "text-[hsl(var(--chat-bubble-sent-text))]" : "text-text-primary",
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
                {renderWithMentions(part, isOwn, {
                  currentUserId,
                  currentUsername,
                  mentions,
                  enrichedNames,
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
            isOwn ? "text-[hsl(var(--chat-bubble-sent-text))]" : "text-[#1565C0]",
          )}
        >
          {renderMode === "collapsed"
            ? t("chat:message.expandLong", { defaultValue: "Xem them" })
            : t("chat:message.collapseLong", { defaultValue: "Thu gon" })}
        </button>
      ) : null}
    </div>
  );
};

export default TextMessage;
