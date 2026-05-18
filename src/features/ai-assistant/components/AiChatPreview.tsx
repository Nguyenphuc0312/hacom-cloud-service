import React from "react";
import clsx from "clsx";
import { Avatar } from "../../../components/common/Avatar";
import { SparklesIcon } from "lucide-react";

export interface AiChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface AiChatPreviewProps {
  messages: AiChatMessage[];
  isLoading?: boolean;
}

export const AiChatPreview: React.FC<AiChatPreviewProps> = ({
  messages,
  isLoading = false,
}) => {
  if (messages.length === 0) return null;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4">
      {messages.map((message) => (
        <div
          key={message.id}
          className={clsx(
            "flex gap-3",
            message.role === "user" && "flex-row-reverse",
          )}
        >
          {message.role === "assistant" ? (
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl shadow-sm" style={{
              background: "linear-gradient(135deg, hsl(206, 100%, 41%) 0%, hsl(206, 100%, 55%) 100%)",
            }}>
              <SparklesIcon className="h-5 w-5 text-white" strokeWidth={1.5} />
            </div>
          ) : (
            <Avatar size="sm" className="flex-shrink-0" />
          )}

          <div
            className={clsx(
              "flex max-w-[80%] flex-col gap-1",
              message.role === "user" && "items-end",
            )}
          >
            <div
              className={clsx(
                "rounded-2xl px-4 py-3 text-body-sm",
                message.role === "user"
                  ? "rounded-br-md bg-primary text-text-inverse"
                  : "rounded-bl-md border border-border bg-surface text-text-primary shadow-xs",
              )}
            >
              {message.content}
            </div>
          </div>
        </div>
      ))}

      {isLoading && (
        <div className="flex gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl shadow-sm" style={{
            background: "linear-gradient(135deg, hsl(206, 100%, 41%) 0%, hsl(206, 100%, 55%) 100%)",
          }}>
            <SparklesIcon className="h-5 w-5 text-white" strokeWidth={1.5} />
          </div>
          <div className="flex items-center gap-1 rounded-bl-md rounded-br-2xl rounded-tl-md rounded-tr-2xl border border-border bg-surface px-4 py-3 shadow-xs">
            <span className="h-2 w-2 animate-bounce rounded-full bg-text-muted [animation-delay:0ms]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-text-muted [animation-delay:150ms]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-text-muted [animation-delay:300ms]" />
          </div>
        </div>
      )}
    </div>
  );
};
