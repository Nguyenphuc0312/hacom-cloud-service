import React, { useCallback } from "react";
import { clsx } from "clsx";
import { MoreHorizontal, Quote } from "lucide-react";
import { useTranslation } from "react-i18next";
import { QuickReactBar } from "../QuickReactBar";

interface MessageActionBarProps {
  /** Renders the Zalo-style 👍 as the first button: click = thumbs-up, hover = emoji bar. */
  onReact?: (emoji: string) => void;
  currentUserReaction?: string | null;
  /** Controls which side the hover emoji bar grows toward. */
  isOwn?: boolean;
  onReplyClick?: () => void;
  onForwardClick?: () => void;
  /** Receives the click event so the caller can anchor a dropdown to the button. */
  onMoreClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
}

const actionBtnClass = clsx(
  "flex h-8 w-8 items-center justify-center rounded-full",
  "text-text-secondary hover:bg-surface-hover hover:text-brand-solid",
  "transition-[opacity,transform,background-color] duration-100",
  "active:scale-90",
);

export const MessageActionBar: React.FC<MessageActionBarProps> = ({
  onReact,
  currentUserReaction,
  isOwn = false,
  onReplyClick,
  onForwardClick,
  onMoreClick,
  className,
}) => {
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const openTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  React.useEffect(() => clearTimers, [clearTimers]);

  const handleReactEnter = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (!openTimerRef.current) {
      openTimerRef.current = setTimeout(() => {
        openTimerRef.current = null;
        setPickerOpen(true);
      }, 150);
    }
  }, []);

  const handleReactLeave = useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    // Ân hạn dài để lỡ trượt chuột ra ngoài một nhịp vẫn không mất thanh emoji.
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setPickerOpen(false);
    }, 400);
  }, []);

  const handlePick = useCallback(
    (emoji: string) => {
      clearTimers();
      setPickerOpen(false);
      onReact?.(emoji);
    },
    [clearTimers, onReact],
  );

  const stop = useCallback((fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  }, []);

  const isLiked = currentUserReaction === "👍";

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
      {onReact && (
        <div
          className="relative"
          onMouseEnter={handleReactEnter}
          onMouseLeave={handleReactLeave}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handlePick("👍");
            }}
            title={t("chat:message.actions.react", "Thả cảm xúc")}
            aria-label={t("chat:message.actions.react", "Thả cảm xúc")}
            aria-pressed={isLiked}
            data-testid="message-action-like"
            className={clsx(
              actionBtnClass,
              "text-[15px]",
              isLiked && "bg-[#1976D2]/10",
            )}
          >
            <span aria-hidden="true" className={clsx(!isLiked && "grayscale")}>
              👍
            </span>
          </button>
          <QuickReactBar
            visible={pickerOpen}
            align={isOwn ? "right" : "left"}
            currentUserReaction={currentUserReaction ?? null}
            onReact={handlePick}
            onMouseEnter={handleReactEnter}
            onMouseLeave={handleReactLeave}
          />
        </div>
      )}

      {onReplyClick && (
        <button
          type="button"
          onClick={stop(onReplyClick)}
          title={t("chat:message.actions.reply", "Trả lời")}
          aria-label={t("chat:message.actions.reply", "Trả lời")}
          className={actionBtnClass}
        >
          <Quote className="h-[16px] w-[16px]" strokeWidth={1.8} />
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
          onClick={(e) => {
            e.stopPropagation();
            onMoreClick(e);
          }}
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
