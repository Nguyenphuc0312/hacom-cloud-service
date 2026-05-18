/**
 * Lazily-loaded markdown renderer.
 *
 * Bundled into its own async chunk so the entire react-markdown + unified
 * ecosystem (~100 kB minified) is only downloaded when a message with
 * contentFormat === "markdown" is first rendered.
 */

import React from "react";
import clsx from "clsx";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    a: [...(defaultSchema.attributes?.a ?? []), "target", "rel"],
  },
};

interface MarkdownContentProps {
  content: string;
  isOwn: boolean;
}

const MarkdownContent: React.FC<MarkdownContentProps> = ({ content, isOwn }) => (
  <div
    className={clsx(
      "chat-message-markdown prose prose-sm max-w-none min-w-0 break-words [overflow-wrap:anywhere]",
      "[&_p]:m-0 [&_p+p]:mt-1",
      "[&_ul]:my-1 [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:pl-5",
      "[&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_pre]:my-1",
      "[&_code]:whitespace-pre-wrap [&_code]:[overflow-wrap:anywhere] [&_code]:text-inherit [&_code]:font-mono [&_code]:text-[0.85em]",
      "[&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto",
      "[&_img]:max-w-full [&_img]:h-auto",
      "[&_a]:[overflow-wrap:anywhere] [&_a]:text-inherit [&_a]:underline [&_a]:underline-offset-2",
      // text-inherit ensures formatting tags keep bubble's text color
      "[&_strong]:font-semibold [&_strong]:text-inherit",
      "[&_b]:font-semibold [&_b]:text-inherit",
      "[&_em]:italic [&_em]:text-inherit",
      "[&_i]:italic [&_i]:text-inherit",
      "[&_u]:underline [&_u]:text-inherit",
      "[&_s]:line-through [&_s]:text-inherit",
      // Use bubble's text color — same pattern as TextMessage.tsx for consistency
      isOwn ? "text-[hsl(var(--chat-bubble-sent-text))]" : "text-text-primary",
      isOwn
        ? "[&_code]:bg-[hsl(var(--chat-bubble-sent-text))]/15"
        : "[&_code]:bg-surface-overlay",
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
              isOwn ? "text-[hsl(var(--chat-bubble-sent-text))]" : "text-primary",
            )}
          >
            {children}
          </a>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  </div>
);

export default MarkdownContent;
