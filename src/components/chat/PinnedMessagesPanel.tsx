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
import { Pin, PinOff } from "lucide-react";
import { Avatar } from "../common/Avatar";
import { NotificationListSkeleton } from "../ui";
import { getMessagePreview } from "../../utils/messageHelpers";
import { formatRelativeTime } from "../../utils/formatTime";
import { useEnrichedProfileStore } from "../../stores/enrichedProfileStore";
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
  const nameByUserId = useEnrichedProfileStore((s) => s.nameByUserId);

  return (
    <div
      className={clsx("flex h-full flex-col bg-surface", className)}
      role="region"
      aria-label={t("chat:pinned.title", { defaultValue: "Tin nhắn ghim" })}
    >
      {/* Header — matches the search / info (GroupInfo) panel header */}
      <div className="sticky top-0 z-10 flex h-12 shrink-0 items-center justify-between border-b border-border bg-surface/95 px-4 backdrop-blur-sm">
        <h3 className="text-sm font-bold text-text-primary">
          {t("chat:pinned.title", { defaultValue: "Tin nhắn ghim" })}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          aria-label={t("common:actions.close", { defaultValue: "Đóng" })}
        >
          <XMarkIcon className="h-5 w-5" />
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
            <Pin
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
            // Alias-if-set wins, same as the timeline/header.
            const senderName =
              nameByUserId[message.senderId] ?? message.senderName ?? "";
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
                    alt={senderName}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-xs font-semibold text-text-primary">
                        {senderName}
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
                    <PinOff
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
