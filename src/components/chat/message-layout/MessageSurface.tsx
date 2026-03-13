import React from "react";
import clsx from "clsx";

interface MessageSurfaceProps {
  isOwn: boolean;
  isGroupStart: boolean;
  isGroupEnd: boolean;
  hasReplyPreview?: boolean;
  hasError?: boolean;
  children: React.ReactNode;
  className?: string;
}

const getBubbleRadiusClass = (
  isOwn: boolean,
  isGroupStart: boolean,
  isGroupEnd: boolean,
): string => {
  if (isOwn) {
    if (isGroupStart && isGroupEnd) return "rounded-2xl rounded-br-md";
    if (isGroupStart) return "rounded-2xl rounded-br-md";
    if (isGroupEnd) return "rounded-2xl rounded-tr-md";
    return "rounded-2xl rounded-r-md";
  }

  if (isGroupStart && isGroupEnd) return "rounded-2xl rounded-bl-md";
  if (isGroupStart) return "rounded-2xl rounded-bl-md";
  if (isGroupEnd) return "rounded-2xl rounded-tl-md";
  return "rounded-2xl rounded-l-md";
};

export const MessageSurface: React.FC<MessageSurfaceProps> = ({
  isOwn,
  isGroupStart,
  isGroupEnd,
  hasReplyPreview = false,
  hasError = false,
  children,
  className,
}) => {
  return (
    <div
      className={clsx(
        "relative min-w-0 border px-3 py-2.5 shadow-xs transition-colors",
        getBubbleRadiusClass(isOwn, isGroupStart, isGroupEnd),
        isOwn
          ? "border-primary/80 bg-primary text-text-inverse"
          : "border-border bg-surface-raised text-text-primary",
        hasReplyPreview && "rounded-t-xl",
        hasError &&
          (isOwn
            ? "border-danger/40 bg-danger/90"
            : "border-danger/30 bg-danger/6"),
        className,
      )}
    >
      {children}
    </div>
  );
};

export default MessageSurface;
