/**
 * MessageActionBar - Floating action bar shown on message hover.
 *
 * Features:
 * - 3 icon buttons: React, Reply, More
 * - 28x28px buttons
 * - Opacity transition (0 → 1, 150ms)
 * - Position: left for outgoing, right for incoming
 */

import React, { useCallback } from "react";
import { clsx } from "clsx";
import { FaceSmileIcon, ArrowUturnLeftIcon, EllipsisHorizontalIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";

interface MessageActionBarProps {
  isOutgoing: boolean;
  onReactClick: () => void;
  onReplyClick: () => void;
  onMoreClick: () => void;
  className?: string;
}

export const MessageActionBar: React.FC<MessageActionBarProps> = ({
  isOutgoing,
  onReactClick,
  onReplyClick,
  onMoreClick,
  className,
}) => {
  const { t } = useTranslation();

  const handleReactClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onReactClick();
    },
    [onReactClick],
  );

  const handleReplyClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onReplyClick();
    },
    [onReplyClick],
  );

  const handleMoreClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onMoreClick();
    },
    [onMoreClick],
  );

  return (
    <div
      className={clsx(
        "absolute z-20 flex items-center gap-0.5 rounded-full",
        "bg-surface/95 border border-border/50 shadow-elev2 backdrop-blur-sm",
        "p-0.5",
        "transition-fast",
        isOutgoing
          ? "-left-12 mr-1 rtl:mr-0 rtl:-right-12 rtl:ml-1"
          : "-right-12 ml-1 rtl:ml-0 rtl:-left-12 rtl:mr-1",
        className,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {/* React button */}
      <button
        type="button"
        onClick={handleReactClick}
        title={t("chat:reaction.add", "Thả reaction")}
        aria-label={t("chat:reaction.add", "Thả reaction")}
        className={clsx(
          "flex h-7 w-7 items-center justify-center rounded-full",
          "text-text-secondary hover:bg-surface-hover hover:text-primary",
          "transition-all duration-100",
          "active:scale-90",
        )}
      >
        <FaceSmileIcon className="h-4 w-4" />
      </button>

      {/* Reply button */}
      <button
        type="button"
        onClick={handleReplyClick}
        title={t("chat:message.reply", "Trả lời")}
        aria-label={t("chat:message.reply", "Trả lời")}
        className={clsx(
          "flex h-7 w-7 items-center justify-center rounded-full",
          "text-text-secondary hover:bg-surface-hover hover:text-primary",
          "transition-all duration-100",
          "active:scale-90",
        )}
      >
        <ArrowUturnLeftIcon className="h-4 w-4" />
      </button>

      {/* More button */}
      <button
        type="button"
        onClick={handleMoreClick}
        title={t("chat:message.more", "Khác")}
        aria-label={t("chat:message.more", "Khác")}
        className={clsx(
          "flex h-7 w-7 items-center justify-center rounded-full",
          "text-text-secondary hover:bg-surface-hover hover:text-primary",
          "transition-all duration-100",
          "active:scale-90",
        )}
      >
        <EllipsisHorizontalIcon className="h-4 w-4" />
      </button>
    </div>
  );
};

export default MessageActionBar;
