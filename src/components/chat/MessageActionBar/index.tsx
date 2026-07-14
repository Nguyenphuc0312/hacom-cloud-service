import React, { useCallback } from "react";
import { clsx } from "clsx";
import { HeartIcon } from "@heroicons/react/24/outline";
import { Check, Copy, MoreHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";

interface MessageActionBarProps {
  onReplyClick?: () => void;
  onReactClick?: () => void;
  onCopyClick?: () => void;
  onForwardClick?: () => void;
  onMoreClick?: () => void;
  copied?: boolean;
  /** Node rendered anchored above the react button (e.g. QuickReactBar) */
  reactionPickerNode?: React.ReactNode;
  className?: string;
}

const actionBtnClass = clsx(
  "flex h-8 w-8 items-center justify-center rounded-full",
  "text-text-secondary hover:bg-surface-hover hover:text-brand-solid",
  "transition-[opacity,transform,background-color] duration-100",
  "active:scale-90",
);

export const MessageActionBar: React.FC<MessageActionBarProps> = ({
  onReplyClick,
  onReactClick,
  onCopyClick,
  onForwardClick,
  onMoreClick,
  copied = false,
  reactionPickerNode,
  className,
}) => {
  const { t } = useTranslation();

  const stop = useCallback((fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  }, []);

  const copyLabel = copied
    ? t("chat:message.copied", "Đã sao chép")
    : t("chat:message.actions.copy", "Sao chép");

  return (
    <div
      className={clsx(
        "flex items-center gap-0.5 rounded-full",
        "bg-surface/95 border border-border/50 shadow-elev2 backdrop-blur-sm",
        "p-0.5",
        "transition-fast",
        className,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {onReplyClick && (
        <button
          type="button"
          onClick={stop(onReplyClick)}
          title={t("chat:message.actions.reply", "Trả lời")}
          aria-label={t("chat:message.actions.reply", "Trả lời")}
          className={actionBtnClass}
        >
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="9 17 4 12 9 7" />
            <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
          </svg>
        </button>
      )}

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
          {reactionPickerNode && (
            <div className="absolute bottom-full left-1/2 z-30 mb-1 -translate-x-1/2">
              {reactionPickerNode}
            </div>
          )}
        </div>
      )}

      {onCopyClick && (
        <button
          type="button"
          onClick={stop(onCopyClick)}
          title={copyLabel}
          aria-label={
            copied
              ? copyLabel
              : t("chat:message.actions.copyAria", "Sao chép tin nhắn")
          }
          className={clsx(
            actionBtnClass,
            copied && "text-success hover:text-success",
          )}
          data-testid="message-action-copy"
        >
          {copied ? (
            <Check className="h-[18px] w-[18px]" strokeWidth={1.7} />
          ) : (
            <Copy className="h-[18px] w-[18px]" strokeWidth={1.7} />
          )}
        </button>
      )}

      {onForwardClick && (
        <button
          type="button"
          onClick={stop(onForwardClick)}
          title={t("chat:message.actions.forward", "Chuyển tiếp")}
          aria-label={t("chat:message.actions.forward", "Chuyển tiếp")}
          className={actionBtnClass}
        >
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 17 20 12 15 7" />
            <path d="M4 18v-2a4 4 0 0 1 4-4h12" />
          </svg>
        </button>
      )}

      {onMoreClick && (
        <button
          type="button"
          onClick={stop(onMoreClick)}
          title={t("chat:header.moreActions", "Thêm")}
          aria-label={t("chat:header.moreActions", "Thêm")}
          className={actionBtnClass}
          data-testid="message-action-more"
        >
          <MoreHorizontal className="h-[18px] w-[18px]" strokeWidth={1.7} />
        </button>
      )}
    </div>
  );
};

export default MessageActionBar;
