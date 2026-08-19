import React from "react";
import clsx from "clsx";

export type MessageBubblePosition = "single" | "first" | "middle" | "last";

interface MessageBubbleProps {
  isOwn: boolean;
  position: MessageBubblePosition;
  isRich?: boolean;
  hasError?: boolean;
  isHighlighted?: boolean;
  /** Render without bubble background/border/radius (e.g. poll card brings its own surface). */
  bare?: boolean;
  className?: string;
  children: React.ReactNode;
}

const INCOMING_RADIUS_MAP: Record<MessageBubblePosition, string> = {
  single: "rounded-[18px]",
  first: "rounded-[18px_18px_18px_8px]",
  middle: "rounded-[18px_12px_12px_8px]",
  last: "rounded-[18px_12px_18px_8px]",
};

const OUTGOING_RADIUS_MAP: Record<MessageBubblePosition, string> = {
  single: "rounded-[18px]",
  first: "rounded-[18px_18px_8px_18px]",
  middle: "rounded-[12px_18px_8px_12px]",
  last: "rounded-[12px_18px_8px_18px]",
};

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  isOwn,
  position,
  isRich = false,
  hasError = false,
  isHighlighted = false,
  bare = false,
  className,
  children,
}) =>
  bare ? (
    <div
      className={clsx(
        "chat-message-bubble relative inline-block box-border min-w-0 max-w-full",
        isHighlighted && "message-highlight-pulse",
        className,
      )}
    >
      {children}
    </div>
  ) : (
    <div
      className={clsx(
        "chat-message-bubble relative inline-block box-border min-w-0 max-w-full overflow-hidden transition-colors",
        hasError && "min-w-[8.5rem]",
        isOwn
          ? "bg-[hsl(var(--chat-bubble-sent))] text-[hsl(var(--chat-bubble-sent-text))]"
          : "border border-black/[0.09] dark:border-white/[0.09] bg-[hsl(var(--chat-bubble-received))] text-[hsl(var(--chat-bubble-received-text))]",
        isOwn ? OUTGOING_RADIUS_MAP[position] : INCOMING_RADIUS_MAP[position],
        isRich ? "px-2 py-2" : "px-3 py-2",
        isHighlighted && "message-highlight-pulse",
        className,
      )}
    >
      {children}
    </div>
  );

export default MessageBubble;
