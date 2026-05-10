import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { isOnlyEmoji } from "../../utils/messageHelpers";
import { toast } from "../ui";
import {
  getCollapsedTextPreview,
  type LongMessageRenderMode,
} from "../../utils/longMessagePolicy";
import { MESSAGE_LINKIFY_MAX_CHARS } from "../../utils/messageLengthPolicy";

const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    a: [...(defaultSchema.attributes?.a ?? []), "target", "rel"],
  },
};

interface TextMessageProps {
  content: string;
  contentFormat?: "plain_text" | "markdown" | "rich_text";
  isOwn: boolean;
  currentUsername?: string;
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

const renderWithMentions = (
  text: string,
  isOwn: boolean,
  currentUsername?: string,
): React.ReactNode[] => {
  if (!currentUsername) return [text];

  const mentionRegex = /(@\w+)/g;
  const segments = text.split(mentionRegex);

  return segments.map((segment, idx) => {
    const isMention = /^@\w+$/.test(segment);
    if (!isMention) return <React.Fragment key={idx}>{segment}</React.Fragment>;

    const mentionedName = segment.slice(1).toLowerCase();
    const isSelfMention = mentionedName === currentUsername.toLowerCase();

    return (
      <span
        key={idx}
        className={clsx(
          "inline rounded px-0.5 font-semibold",
          isSelfMention
            ? isOwn
              ? "bg-text-inverse/20 text-text-inverse"
              : "bg-primary/15 text-primary"
            : isOwn
              ? "text-text-inverse/95"
              : "text-primary/80",
        )}
      >
        {segment}
      </span>
    );
  });
};

export const TextMessage: React.FC<TextMessageProps> = ({
  content,
  contentFormat,
  isOwn,
  currentUsername,
  renderMode = "expanded",
  isCollapsible = false,
  onToggleExpand,
  className,
}) => {
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
        <div
          className={clsx(
            "chat-message-markdown prose prose-sm max-w-none min-w-0 break-words [overflow-wrap:anywhere]",
            // Contain prose inside chat bubble — collapse default prose margins
            "[&_p]:m-0 [&_p+p]:mt-1",
            "[&_ul]:my-1 [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:pl-5",
            "[&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_pre]:my-1",
            "[&_code]:whitespace-pre-wrap [&_code]:[overflow-wrap:anywhere]",
            "[&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto",
            "[&_img]:max-w-full [&_img]:h-auto",
            "[&_a]:[overflow-wrap:anywhere]",
            isOwn ? "prose-invert text-text-inverse" : "text-text-primary",
          )}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
            components={{
              a: ({ children, href, ...props }) => (
                <a
                  {...props}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={clsx(
                    "underline underline-offset-2",
                    isOwn ? "text-text-inverse" : "text-primary",
                  )}
                >
                  {children}
                </a>
              ),
            }}
          >
            {displayContent}
          </ReactMarkdown>
        </div>
        {isCollapsible && onToggleExpand ? (
          <button
            type="button"
            onClick={onToggleExpand}
            className={clsx(
              "text-xs font-semibold underline-offset-2 hover:underline",
              isOwn ? "text-text-inverse" : "text-primary",
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
            className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
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
                  isOwn ? "text-text-inverse" : "text-text-primary",
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
                    "underline decoration-border-strong underline-offset-2 transition-colors",
                    isOwn
                      ? "text-text-inverse hover:text-text-inverse/85"
                      : "text-primary hover:text-secondary",
                  )}
                >
                  {part}
                </a>
              );
            }

            return (
              <React.Fragment key={index}>
                {renderWithMentions(part, isOwn, currentUsername)}
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
            isOwn ? "text-text-inverse" : "text-primary",
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
