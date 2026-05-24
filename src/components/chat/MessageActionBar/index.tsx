import React, { useCallback } from "react";
import { clsx } from "clsx";
import { HeartIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";

interface MessageActionBarProps {
  isOutgoing: boolean;
  onReplyClick: () => void;
  onForwardClick?: () => void;
  onReactClick?: () => void;
  /** Node rendered anchored above the react button (e.g. QuickReactBar) */
  reactionPickerNode?: React.ReactNode;
  className?: string;
}

const actionBtnClass = clsx(
  "flex h-8 w-8 items-center justify-center rounded-full",
  "text-text-secondary hover:bg-surface-hover hover:text-primary",
  "transition-all duration-100",
  "active:scale-90",
);

export const MessageActionBar: React.FC<MessageActionBarProps> = ({
  isOutgoing,
  onReplyClick,
  onForwardClick,
  onReactClick,
  reactionPickerNode,
  className,
}) => {
  const { t } = useTranslation();

  const stop = useCallback((fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  }, []);

  const buttonCount = 1 + (onReactClick ? 1 : 0) + (onForwardClick ? 1 : 0);
  const barOffsetClass = buttonCount <= 1
    ? (isOutgoing ? "-left-[3.75rem]" : "-right-[3.75rem]")
    : buttonCount === 2
      ? (isOutgoing ? "-left-[6rem]" : "-right-[6rem]")
      : (isOutgoing ? "-left-[8.5rem]" : "-right-[8.5rem]");

  return (
    <div
      className={clsx(
        "absolute z-20 flex items-center gap-0.5 rounded-full",
        "bg-surface/95 border border-border/50 shadow-elev2 backdrop-blur-sm",
        "p-0.5",
        "transition-fast",
        barOffsetClass,
        isOutgoing ? "mr-1" : "ml-1",
        className,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {/* React / Heart button — picker rendered above this button */}
      {onReactClick && (
        <div className="relative">
          <button
            type="button"
            onClick={stop(onReactClick)}
            title={t("chat:message.actions.react", "Cảm xúc")}
            aria-label={t("chat:message.actions.react", "Cảm xúc")}
            className={actionBtnClass}
          >
            <HeartIcon className="h-[18px] w-[18px]" />
          </button>
          {/* Picker floats above this button, centered horizontally */}
          {reactionPickerNode && (
            <div className="absolute bottom-full left-1/2 z-30 mb-1 -translate-x-1/2">
              {reactionPickerNode}
            </div>
          )}
        </div>
      )}

      {/* Reply button */}
      <button
        type="button"
        onClick={stop(onReplyClick)}
        title={t("chat:message.reply", "Trả lời")}
        aria-label={t("chat:message.reply", "Trả lời")}
        className={actionBtnClass}
      >
        {/* Reply — Zalo-style: simple left-curved arrow ↩ */}
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="9 17 4 12 9 7" />
          <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
        </svg>
      </button>

      {/* Forward button */}
      {onForwardClick && (
        <button
          type="button"
          onClick={stop(onForwardClick)}
          title={t("chat:message.actions.forward", "Chuyển tiếp")}
          aria-label={t("chat:message.actions.forward", "Chuyển tiếp")}
          className={actionBtnClass}
        >
          {/* Forward — Zalo-style: mirror of reply ↪ */}
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 17 20 12 15 7" />
            <path d="M4 18v-2a4 4 0 0 1 4-4h12" />
          </svg>
        </button>
      )}
    </div>
  );
};

export default MessageActionBar;
