import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import { isOnlyEmoji } from "../../utils/messageHelpers";
import {
  getCollapsedTextPreview,
  type LongMessageRenderMode,
} from "../../utils/longMessagePolicy";

interface TextMessageProps {
  content: string;
  isOwn: boolean;
  currentUsername?: string;
  renderMode?: LongMessageRenderMode;
  isCollapsible?: boolean;
  onToggleExpand?: () => void;
  className?: string;
}

const LOG_LEVEL_REGEX = /(^|\n)\s*(TRACE|DEBUG|INFO|WARN|WARNING|ERROR)\b/m;
const KEY_VALUE_LINE_REGEX = /(^|\n)\s*[\w.-]+\s*[:=]\s*.+/m;

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
  isOwn,
  currentUsername,
  renderMode = "expanded",
  isCollapsible = false,
  onToggleExpand,
  className,
}) => {
  const { t } = useTranslation();
  const displayContent =
    isCollapsible && renderMode === "collapsed"
      ? getCollapsedTextPreview(content)
      : content;
  const structuredBlockContent = getStructuredBlockContent(displayContent);
  const onlyEmoji = isOnlyEmoji(displayContent);
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = displayContent.split(urlRegex);

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
              onClick={() => void navigator.clipboard.writeText(structuredBlockContent)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-text-muted transition-colors hover:text-text-primary"
            >
              <ClipboardDocumentIcon className="h-3.5 w-3.5" />
              {t("chat:message.actions.copy", { defaultValue: "Copy" })}
            </button>
          </div>
          <pre className="max-h-60 overflow-auto px-3 py-2 text-[12px] leading-[18px] text-text-secondary">
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
      <p
        className={clsx(
          "chat-message-text max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere]",
          onlyEmoji ? "leading-tight text-3xl" : "text-[14px] leading-[21px] text-text-primary",
          className,
        )}
      >
        {parts.map((part, index) => {
          const isLink = /^https?:\/\/[^\s]+$/i.test(part);
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
                    ? "text-text-primary hover:text-secondary"
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

      {isCollapsible && onToggleExpand ? (
        <button
          type="button"
          onClick={onToggleExpand}
          className={clsx(
            "text-xs font-semibold underline-offset-2 hover:underline",
            isOwn ? "text-text-primary" : "text-primary",
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
