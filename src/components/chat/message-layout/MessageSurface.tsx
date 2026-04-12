import React from "react";
import clsx from "clsx";

interface MessageSurfaceProps {
  isOwn: boolean;
  isGroupStart: boolean;
  isGroupEnd: boolean;
  hasReplyPreview?: boolean;
  hasError?: boolean;
  isPending?: boolean;
  children: React.ReactNode;
  className?: string;
}

const getBubbleRadiusClass = (
  isOwn: boolean,
  isGroupStart: boolean,
  isGroupEnd: boolean,
): string => {
  if (isOwn) {
    if (isGroupStart && isGroupEnd) return "rounded-[22px] rounded-br-[10px]";
    if (isGroupStart) return "rounded-[22px] rounded-br-[10px]";
    if (isGroupEnd) return "rounded-[22px] rounded-tr-[10px]";
    return "rounded-[22px] rounded-r-[10px]";
  }

  if (isGroupStart && isGroupEnd) return "rounded-[22px] rounded-bl-[10px]";
  if (isGroupStart) return "rounded-[22px] rounded-bl-[10px]";
  if (isGroupEnd) return "rounded-[22px] rounded-tl-[10px]";
  return "rounded-[22px] rounded-l-[10px]";
};

export const MessageSurface: React.FC<MessageSurfaceProps> = ({
  isOwn,
  isGroupStart,
  isGroupEnd,
  hasReplyPreview = false,
  hasError = false,
  isPending = false,
  children,
  className,
}) => {
  return (
    <div
      className={clsx(
        "relative min-w-0 px-3.5 py-2.5 transition-colors",
        getBubbleRadiusClass(isOwn, isGroupStart, isGroupEnd),
        isOwn
          ? "bg-[hsl(var(--chat-bubble-sent))] text-[hsl(var(--chat-bubble-sent-text))]"
          : "bg-[hsl(var(--chat-bubble-received))] text-[hsl(var(--chat-bubble-received-text))]",
        hasReplyPreview && "rounded-t-[18px]",
        hasError &&
          (isOwn
            ? "ring-1 ring-danger/35"
            : "bg-danger/6 ring-1 ring-danger/20"),
        isPending && "opacity-90",
        className,
      )}
    >
      {children}
    </div>
  );
};

export default MessageSurface;
