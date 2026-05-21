import React, { useCallback } from "react";
import { clsx } from "clsx";
import { ArrowUturnLeftIcon, EllipsisHorizontalIcon, FaceSmileIcon } from "@heroicons/react/24/outline";
import { Forward } from "lucide-react";
import { useTranslation } from "react-i18next";

interface MessageActionBarProps {
  isOutgoing: boolean;
  onReplyClick: () => void;
  onMoreClick: () => void;
  onForwardClick?: () => void;
  onReactClick?: () => void;
  className?: string;
}

const actionBtnClass = clsx(
  "flex h-7 w-7 items-center justify-center rounded-full",
  "text-text-secondary hover:bg-surface-hover hover:text-primary",
  "transition-all duration-100",
  "active:scale-90",
);

export const MessageActionBar: React.FC<MessageActionBarProps> = ({
  isOutgoing,
  onReplyClick,
  onMoreClick,
  onForwardClick,
  onReactClick,
  className,
}) => {
  const { t } = useTranslation();

  const stop = useCallback((fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  }, []);

  const buttonCount = 2 + (onReactClick ? 1 : 0) + (onForwardClick ? 1 : 0);
  const barOffsetClass = buttonCount <= 2
    ? (isOutgoing ? "-left-14" : "-right-14")
    : buttonCount === 3
      ? (isOutgoing ? "-left-[5.5rem]" : "-right-[5.5rem]")
      : (isOutgoing ? "-left-[8rem]" : "-right-[8rem]");

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
      {/* React / Emoji button */}
      {onReactClick && (
        <button
          type="button"
          onClick={stop(onReactClick)}
          title={t("chat:message.actions.react", "Cảm xúc")}
          aria-label={t("chat:message.actions.react", "Cảm xúc")}
          className={actionBtnClass}
        >
          <FaceSmileIcon className="h-4 w-4" />
        </button>
      )}

      {/* Reply button */}
      <button
        type="button"
        onClick={stop(onReplyClick)}
        title={t("chat:message.reply", "Trả lời")}
        aria-label={t("chat:message.reply", "Trả lời")}
        className={actionBtnClass}
      >
        <ArrowUturnLeftIcon className="h-4 w-4" />
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
          <Forward className="h-4 w-4" />
        </button>
      )}

      {/* More button */}
      <button
        type="button"
        onClick={stop(onMoreClick)}
        title={t("chat:message.more", "Khác")}
        aria-label={t("chat:message.more", "Khác")}
        className={actionBtnClass}
      >
        <EllipsisHorizontalIcon className="h-4 w-4" />
      </button>
    </div>
  );
};

export default MessageActionBar;
