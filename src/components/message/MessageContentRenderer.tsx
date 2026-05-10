import React from "react";
import clsx from "clsx";
import { sanitizeMessageHtml } from "../../utils/messageContent.utils";

interface MessageContentRendererProps {
  content: string;
  contentFormat?: "plain_text" | "rich_text" | "markdown";
  isOwn: boolean;
  className?: string;
}

export const MessageContentRenderer: React.FC<MessageContentRendererProps> = ({
  content,
  contentFormat,
  isOwn,
  className,
}) => {
  const HTML_TAG_RE = /^<(p|div|ul|ol|li|strong|em|b|i|u|s|del|blockquote|h[1-6]|code|pre)\b/i;
  const isRich =
    contentFormat === "rich_text" ||
    (!contentFormat && !!content && HTML_TAG_RE.test(content.trim()));

  if (isRich) {
    const safeHtml = sanitizeMessageHtml(content);
    return (
      <div
        className={clsx(
          "message-rich-content break-words [overflow-wrap:anywhere]",
          "text-[14px] leading-[21px]",
          isOwn ? "text-text-inverse" : "text-text-primary",
          // Typography resets for nested HTML elements
          "[&_strong]:font-bold [&_b]:font-bold",
          "[&_em]:italic [&_i]:italic",
          "[&_u]:underline",
          "[&_s]:line-through [&_del]:line-through",
          "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1",
          "[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1",
          "[&_li]:my-0.5",
          "[&_p]:m-0 [&_p+p]:mt-1",
          "[&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]",
          isOwn
            ? "[&_code]:bg-text-inverse/15"
            : "[&_code]:bg-surface-overlay",
          "[&_a]:underline [&_a]:underline-offset-2",
          isOwn
            ? "[&_a]:text-text-inverse [&_a]:hover:text-text-inverse/85"
            : "[&_a]:text-primary [&_a]:hover:text-secondary",
          className,
        )}
        // DOMPurify already sanitized — safe to use dangerouslySetInnerHTML
        dangerouslySetInnerHTML={{ __html: safeHtml }}
      />
    );
  }

  // plain_text or legacy (no contentFormat)
  return (
    <p
      className={clsx(
        "chat-message-text max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere]",
        "text-[14px] leading-[21px]",
        isOwn ? "text-text-inverse" : "text-text-primary",
        className,
      )}
    >
      {content}
    </p>
  );
};
