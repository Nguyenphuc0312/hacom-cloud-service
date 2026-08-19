import React from "react";
import clsx from "clsx";
import type { TimelineMergeLevel } from "../../../hooks/useMessageGrouping";

interface MessageSurfaceProps {
  isOwn: boolean;
  isGroupStart: boolean;
  isGroupEnd: boolean;
  mergeLevel?: TimelineMergeLevel;
  hasError?: boolean;
  isPending?: boolean;
  /** Render without bubble background/radius (e.g. poll card brings its own surface). */
  bare?: boolean;
  children: React.ReactNode;
  className?: string;
}

const getBubbleRadiusClass = (
  isOwn: boolean,
  isGroupStart: boolean,
  isGroupEnd: boolean,
  mergeLevel: TimelineMergeLevel,
): string => {
  const semanticOwn = {
    single: "rounded-[var(--chat-bubble-radius)] rounded-br-[var(--chat-bubble-corner-radius)]",
    start: "rounded-[var(--chat-bubble-radius)] rounded-br-[var(--chat-bubble-corner-radius)]",
    end: "rounded-[var(--chat-bubble-radius)] rounded-tr-[var(--chat-bubble-corner-radius)]",
    middle: "rounded-[var(--chat-bubble-radius)] rounded-r-[var(--chat-bubble-corner-radius)]",
  };
  const semanticOther = {
    single: "rounded-[var(--chat-bubble-radius)] rounded-bl-[var(--chat-bubble-corner-radius)]",
    start: "rounded-[var(--chat-bubble-radius)] rounded-bl-[var(--chat-bubble-corner-radius)]",
    end: "rounded-[var(--chat-bubble-radius)] rounded-tl-[var(--chat-bubble-corner-radius)]",
    middle: "rounded-[var(--chat-bubble-radius)] rounded-l-[var(--chat-bubble-corner-radius)]",
  };
  const defaultOwn = {
    single: "rounded-[var(--chat-bubble-radius)] rounded-br-[var(--chat-bubble-corner-radius)]",
    start: "rounded-[var(--chat-bubble-radius)] rounded-br-[var(--chat-bubble-corner-radius)]",
    end: "rounded-[var(--chat-bubble-radius)] rounded-tr-[var(--chat-bubble-corner-radius)]",
    middle: "rounded-[var(--chat-bubble-radius)] rounded-r-[var(--chat-bubble-corner-radius)]",
  };
  const defaultOther = {
    single: "rounded-[var(--chat-bubble-radius)] rounded-bl-[var(--chat-bubble-corner-radius)]",
    start: "rounded-[var(--chat-bubble-radius)] rounded-bl-[var(--chat-bubble-corner-radius)]",
    end: "rounded-[var(--chat-bubble-radius)] rounded-tl-[var(--chat-bubble-corner-radius)]",
    middle: "rounded-[var(--chat-bubble-radius)] rounded-l-[var(--chat-bubble-corner-radius)]",
  };
  const palette =
    mergeLevel === "semantically-merged"
      ? isOwn
        ? semanticOwn
        : semanticOther
      : isOwn
        ? defaultOwn
        : defaultOther;

  if (isGroupStart && isGroupEnd) return palette.single;
  if (isGroupStart) return palette.start;
  if (isGroupEnd) return palette.end;
  return palette.middle;
};

export const MessageSurface: React.FC<MessageSurfaceProps> = React.memo(
  ({
    isOwn,
    isGroupStart,
    isGroupEnd,
    mergeLevel = "not-merged",
    hasError = false,
    isPending = false,
    bare = false,
    children,
    className,
  }) => {
    if (bare) {
      return (
        <div className={clsx("chat-message-surface relative box-border w-fit min-w-0 max-w-full", className)}>
          {children}
        </div>
      );
    }
    return (
      <div
        className={clsx(
          "chat-message-surface relative box-border w-fit min-w-0 max-w-full overflow-hidden px-[var(--chat-message-padding-x)] py-[var(--chat-message-padding-y)] text-[14.5px] leading-[var(--chat-message-line-height)] transition-colors",
          hasError && "min-w-[8.5rem]",
          getBubbleRadiusClass(isOwn, isGroupStart, isGroupEnd, mergeLevel),
          isOwn
            ? "bg-[hsl(var(--chat-bubble-sent))] text-[hsl(var(--chat-bubble-sent-text))]"
            : "bg-[hsl(var(--chat-bubble-received))] text-[hsl(var(--chat-bubble-received-text))]",
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
  },
  (prev, next) =>
    prev.isOwn === next.isOwn &&
    prev.isGroupStart === next.isGroupStart &&
    prev.isGroupEnd === next.isGroupEnd &&
    prev.mergeLevel === next.mergeLevel &&
    prev.hasError === next.hasError &&
    prev.isPending === next.isPending &&
    prev.bare === next.bare &&
    prev.children === next.children &&
    prev.className === next.className,
);

export default MessageSurface;
