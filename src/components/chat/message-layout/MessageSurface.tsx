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
    single: "rounded-[22px] rounded-br-[14px]",
    start: "rounded-[22px] rounded-br-[14px]",
    end: "rounded-[22px] rounded-tr-[14px]",
    middle: "rounded-[22px] rounded-r-[14px]",
  };
  const semanticOther = {
    single: "rounded-[22px] rounded-bl-[14px]",
    start: "rounded-[22px] rounded-bl-[14px]",
    end: "rounded-[22px] rounded-tl-[14px]",
    middle: "rounded-[22px] rounded-l-[14px]",
  };
  const defaultOwn = {
    single: "rounded-[22px] rounded-br-[10px]",
    start: "rounded-[22px] rounded-br-[10px]",
    end: "rounded-[22px] rounded-tr-[10px]",
    middle: "rounded-[22px] rounded-r-[10px]",
  };
  const defaultOther = {
    single: "rounded-[22px] rounded-bl-[10px]",
    start: "rounded-[22px] rounded-bl-[10px]",
    end: "rounded-[22px] rounded-tl-[10px]",
    middle: "rounded-[22px] rounded-l-[10px]",
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

export const MessageSurface: React.FC<MessageSurfaceProps> = ({
  isOwn,
  isGroupStart,
  isGroupEnd,
  mergeLevel = "not-merged",
  hasError = false,
  isPending = false,
  children,
  className,
}) => {
  return (
    <div
      className={clsx(
        "relative min-w-0 px-3 py-2.5 transition-colors text-[15px] leading-[1.48]",
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
};

export default MessageSurface;
