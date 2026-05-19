import React, { useEffect, useRef, useState } from "react";
import { SparklesIcon } from "lucide-react";
import clsx from "clsx";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { useTranslation } from "react-i18next";
import {
  DocumentTextIcon,
  ChevronDownIcon,
  DocumentIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import type { AiChatSource } from "../types";

export interface AiChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  sources?: AiChatSource[];
  error?: boolean;
}

interface AiChatPreviewProps {
  messages: AiChatMessage[];
  isLoading?: boolean;
}

function getSourceFileName(source: AiChatSource): string {
  if (source.source_name) return source.source_name;
  const parts = source.source_path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] ?? source.source_path;
}

const AiSourcesPanel: React.FC<{ sources: AiChatSource[] }> = ({ sources }) => {
  const { t } = useTranslation("aiAssistant");
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-border bg-[var(--chat-shell-bg)] text-body-sm">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-text-secondary transition-colors hover:text-text-primary"
      >
        <span className="flex items-center gap-1.5">
          <DocumentTextIcon className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.5} />
          <span>{t("chat.sources", { count: sources.length })}</span>
        </span>
        <ChevronDownIcon
          className={clsx(
            "h-3.5 w-3.5 flex-shrink-0 transition-transform duration-200",
            expanded && "rotate-180",
          )}
          strokeWidth={1.5}
        />
      </button>

      {expanded && (
        <div className="flex flex-col gap-1.5 border-t border-border px-3 pb-3 pt-2">
          {sources.map((source, idx) => (
            <div
              key={idx}
              className="flex items-start gap-2 rounded-lg bg-surface px-2.5 py-2"
            >
              <DocumentIcon
                className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-text-muted"
                strokeWidth={1.5}
              />
              <div className="min-w-0">
                <p className="truncate font-medium text-text-primary">
                  {getSourceFileName(source)}
                </p>
                <p className="text-xs text-text-muted">
                  {t("chat.sourcePage", { page: source.page_number })}
                  {source.final_score > 0
                    ? ` · ${t("chat.sourceScore", { score: source.final_score.toFixed(2) })}`
                    : ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const AiChatPreview: React.FC<AiChatPreviewProps> = ({
  messages,
  isLoading = false,
}) => {
  const { t } = useTranslation("aiAssistant");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  return (
    <div className="flex w-full flex-col gap-8">
      {messages.map((message) => {
        if (message.role === "assistant") {
          return (
            <div key={message.id} className="flex gap-3">
              <div
                className={clsx(
                  "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-white",
                  message.error ? "bg-red-500" : "bg-primary",
                )}
              >
                {message.error ? (
                  <ExclamationTriangleIcon className="h-4 w-4" strokeWidth={1.5} />
                ) : (
                  <SparklesIcon className="h-4 w-4" strokeWidth={1.5} />
                )}
              </div>

              <div className="mt-0.5 min-w-0 max-w-[85%]">
                {message.error ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-body text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-400">
                    {message.content}
                  </div>
                ) : (
                  <>
                    <div
                      className={clsx(
                        "text-body text-text-primary",
                        "[&_p]:m-0 [&_p+p]:mt-2",
                        "[&_ul]:my-2 [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:pl-5",
                        "[&_li]:my-0.5",
                        "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-surface-overlay [&_pre]:p-3",
                        "[&_code]:rounded [&_code]:bg-surface-overlay [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]",
                        "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
                        "[&_strong]:font-semibold",
                        "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
                        "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-text-secondary",
                        "[&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-bold",
                        "[&_h2]:mb-1.5 [&_h2]:text-base [&_h2]:font-semibold",
                        "[&_h3]:mb-1 [&_h3]:font-semibold",
                      )}
                    >
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeSanitize]}
                        components={{
                          a: ({ children, href, ...props }) => (
                            <a
                              {...props}
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {children}
                            </a>
                          ),
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>

                    {message.sources && message.sources.length > 0 && (
                      <AiSourcesPanel sources={message.sources} />
                    )}
                  </>
                )}
              </div>
            </div>
          );
        }

        return (
          <div key={message.id} className="flex justify-end">
            <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-4 py-3 text-body-sm text-white">
              {message.content}
            </div>
          </div>
        );
      })}

      {isLoading && (
        <div className="flex gap-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-primary text-white">
            <SparklesIcon className="h-4 w-4" strokeWidth={1.5} />
          </div>
          <div className="mt-1 flex items-center gap-1">
            <span
              className="h-2 w-2 animate-bounce rounded-full bg-text-muted"
              style={{ animationDelay: "0ms" }}
            />
            <span
              className="h-2 w-2 animate-bounce rounded-full bg-text-muted"
              style={{ animationDelay: "150ms" }}
            />
            <span
              className="h-2 w-2 animate-bounce rounded-full bg-text-muted"
              style={{ animationDelay: "300ms" }}
            />
          </div>
          <span className="mt-0.5 text-body-sm text-text-muted">{t("chat.aiTyping")}</span>
        </div>
      )}

      <div ref={bottomRef} aria-hidden="true" />
    </div>
  );
};
