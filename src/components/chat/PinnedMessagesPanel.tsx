/**
 * @fileoverview PinnedMessagesPanel
 * Presentational panel that lists pinned messages for a conversation.
 * Click an item to jump to it; hover to reveal the unpin action.
 * Data + mutations are owned by the parent (ChatWindow) so the panel stays
 * in sync with the pinned-message bar.
 */

import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { HugeiconsIcon } from "@hugeicons/react";
import { PinIcon, PinOffIcon } from "@hugeicons/core-free-icons";
import { Avatar } from "../common/Avatar";
import { NotificationListSkeleton } from "../ui";
import { getMessagePreview } from "../../utils/messageHelpers";
import { formatRelativeTime } from "../../utils/formatTime";
import type { Message } from "../../types";

interface PinnedMessagesPanelProps {
  pinnedMessages: Message[];
  isLoading?: boolean;
  error?: string | null;
  currentUserId: string;
  onClose: () => void;
  onJumpToMessage?: (message: Message) => void;
  onUnpin?: (message: Message) => void | Promise<unknown>;
  className?: string;
}

export const PinnedMessagesPanel: React.FC<PinnedMessagesPanelProps> = ({
  pinnedMessages,
  isLoading = false,
  error = null,
  currentUserId,
  onClose,
  onJumpToMessage,
  onUnpin,
  className,
}) => {
  const { t } = useTranslation();

  return (
    <div
      className={clsx("flex h-full flex-col bg-surface", className)}
      role="region"
      aria-label={t("chat:pinned.title", { defaultValue: "Tin nhắn ghim" })}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-border/60 px-4 py-3">
        <HugeiconsIcon
          icon={PinIcon}
          className="h-[18px] w-[18px] text-[#C41E3A]"
          strokeWidth={1.5}
        />
        <h3 className="flex-1 text-sm font-semibold text-text-primary">
          {t("chat:pinned.title", { defaultValue: "Tin nhắn ghim" })}
        </h3>
        {pinnedMessages.length > 0 && (
          <span className="rounded-full bg-[#C41E3A]/10 px-2 py-0.5 text-xs font-medium text-[#C41E3A]">
            {pinnedMessages.length}
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-text-secondary transition-micro hover:bg-surface-hover hover:text-text-primary active:scale-95"
          aria-label={t("common:actions.close", { defaultValue: "Đóng" })}
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading && <NotificationListSkeleton count={4} />}

        {error && !isLoading && (
          <div className="px-4 py-4 text-center">
            <p className="text-xs text-danger">{error}</p>
          </div>
        )}

        {!isLoading && !error && pinnedMessages.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <HugeiconsIcon
              icon={PinIcon}
              className="h-9 w-9 text-text-muted/50"
              strokeWidth={1.5}
            />
            <p className="text-xs font-medium text-text-secondary">
              {t("chat:pinned.empty", { defaultValue: "Chưa có tin nhắn ghim" })}
            </p>
          </div>
        )}

        {!isLoading &&
          !error &&
          pinnedMessages.map((message) => {
            const preview = getMessagePreview(message, currentUserId, 140);
            return (
              <div
                key={message.id}
                className={clsx(
                  "group relative flex items-start gap-3 border-b border-border/30 px-4 py-3",
                  "transition-micro hover:bg-surface-hover/60",
                )}
              >
                <button
                  type="button"
                  onClick={() => onJumpToMessage?.(message)}
                  className="flex min-w-0 flex-1 items-start gap-3 text-left focus-visible:outline-none"
                  aria-label={t("chat:pinned.jumpTo", {
                    defaultValue: "Đi tới tin nhắn",
                  })}
                >
                  <Avatar
                    src={message.senderAvatar}
                    alt={message.senderName ?? ""}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-xs font-semibold text-text-primary">
                        {message.senderName ?? ""}
                      </span>
                      <span className="shrink-0 text-[11px] text-text-muted">
                        {formatRelativeTime(new Date(message.createdAt))}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-text-secondary">
                      {preview}
                    </p>
                  </div>
                </button>

                {onUnpin && (
                  <button
                    type="button"
                    onClick={() => onUnpin(message)}
                    className={clsx(
                      "shrink-0 rounded-md p-1.5 text-text-muted",
                      "transition-micro hover:bg-danger/10 hover:text-danger active:scale-95",
                      "opacity-0 focus-visible:opacity-100 group-hover:opacity-100",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
                    )}
                    title={t("chat:pinned.unpin", { defaultValue: "Bỏ ghim" })}
                    aria-label={t("chat:pinned.unpin", {
                      defaultValue: "Bỏ ghim",
                    })}
                  >
                    <HugeiconsIcon
                      icon={PinOffIcon}
                      className="h-[18px] w-[18px]"
                      strokeWidth={1.5}
                    />
                  </button>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
};

export default PinnedMessagesPanel;
