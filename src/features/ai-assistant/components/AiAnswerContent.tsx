import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import type { AiSource } from "../types";
import { isSafeSourceUrl, preprocessCitations } from "../utils/sourceUtils";

interface AiAnswerContentProps {
  content: string;
  sources?: AiSource[];
  isStreaming?: boolean;
}

// Cho phép target/rel/title trên thẻ <a> để citation link và link thường hoạt động đúng
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    a: [...(defaultSchema.attributes?.a ?? []), "target", "rel", "title"],
  },
};

/**
 * Render nội dung AI dạng markdown, nhận biết citation [N] và chuyển thành link chip.
 */
export const AiAnswerContent: React.FC<AiAnswerContentProps> = ({
  content,
  sources,
  isStreaming,
}) => {
  const processedContent =
    sources && sources.length > 0
      ? preprocessCitations(content, sources)
      : content;

  return (
    <div className="prose-chatgpt relative">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
        components={{
          a: ({ href, title, children, ...props }) => {
            const isCitation = !!href && isSafeSourceUrl(href);
            if (isCitation) {
              return (
                <a
                  {...props}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={title}
                  className="citation-link"
                >
                  {children}
                </a>
              );
            }
            return (
              <a
                {...props}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                title={title}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {processedContent}
      </ReactMarkdown>
      {isStreaming && content && (
        <span className="inline-block w-[3px] h-5 bg-text-primary ml-0.5 translate-y-1 animate-typing-cursor rounded-sm" />
      )}
    </div>
  );
};
