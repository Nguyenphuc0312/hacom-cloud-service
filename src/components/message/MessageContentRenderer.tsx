import React from "react";
import clsx from "clsx";
import {
  sanitizeMessageHtml,
  shouldTreatMessageContentAsRichText,
} from "../../utils/messageContent.utils";

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
  const isRich = shouldTreatMessageContentAsRichText({
    contentFormat,
    content,
  });

  if (isRich) {
    const safeHtml = sanitizeMessageHtml(content);
    return (
      <div
        className={clsx(
          "message-rich-content min-w-0 break-words [overflow-wrap:anywhere]",
          "text-[14px] leading-[21px]",
          isOwn ? "text-text-inverse" : "text-text-primary",
          // Typography resets for nested HTML elements
          "[&_strong]:font-bold [&_b]:font-bold",
          "[&_em]:italic [&_i]:italic",
          "[&_u]:underline",
          "[&_s]:line-through [&_del]:line-through",
          "[&_blockquote]:my-1 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:opacity-90",
          "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1",
          "[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1",
          "[&_li]:my-0.5",
          "[&_p]:m-0 [&_p+p]:mt-1",
          "[&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_pre]:my-1",
          "[&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:whitespace-pre-wrap [&_code]:[overflow-wrap:anywhere]",
          isOwn ? "[&_code]:bg-text-inverse/15" : "[&_code]:bg-surface-overlay",
          "[&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto",
          "[&_img]:max-w-full [&_img]:h-auto",
          "[&_a]:underline [&_a]:underline-offset-2 [&_a]:[overflow-wrap:anywhere]",
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
