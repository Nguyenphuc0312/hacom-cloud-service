import React, { useEffect, useRef } from "react";
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
              {/* AI icon */}
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-primary text-white">
                <SparklesIcon className="h-4 w-4" strokeWidth={1.5} />
              </div>

              {/* AI message — no bubble, plain text */}
              <div className="mt-0.5 max-w-[85%] text-body text-text-primary">
                {message.content}
              </div>
            </div>
          );
        }

        // User message — bubble, right-aligned
        return (
          <div
            key={message.id}
            className="flex justify-end"
          >
            <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-body-sm text-white">
              {message.content}
            </div>
          </div>
        );
      })}

      {/* Typing indicator */}
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
        </div>
      )}

      <div ref={bottomRef} aria-hidden="true" />
    </div>
  );
};
