import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { XMarkIcon } from "@heroicons/react/24/outline";
import type { Message } from "../../../types";
import { getPreviewFromMessage } from "../../../utils/messageContent.utils";

interface ComposerReplyBannerProps {
  replyToMessage: Message;
  onCancelReply?: () => void;
}

export const ComposerReplyBanner: React.FC<ComposerReplyBannerProps> = ({
  replyToMessage,
  onCancelReply,
}) => {
  const { t } = useTranslation();

  return (
    <div className="mb-2 flex items-center justify-between rounded-xl border border-border/70 bg-surface px-3 py-2 animate-slide-up-fade">
      <div className="flex min-w-0 items-center gap-2">
        <div className="h-7 w-1 rounded-full bg-primary" />
        <div className="min-w-0">
          <p className="text-xs font-medium text-primary">
            {t("chat:composer.replyingTo", {
              name: replyToMessage.senderName,
            })}
          </p>
          <p className="truncate text-xs text-text-muted">
            {getPreviewFromMessage({
              contentFormat: replyToMessage.contentFormat,
              plainText: replyToMessage.plainText,
              content: replyToMessage.content,
            })}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onCancelReply}
        className={clsx(
          "rounded-full p-1 transition-colors hover:bg-surface-active",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
        )}
        aria-label={t("chat:composer.cancelReply")}
      >
        <XMarkIcon className="h-4 w-4 text-text-muted" />
      </button>
    </div>
  );
};
