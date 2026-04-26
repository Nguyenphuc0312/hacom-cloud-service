/**
 * @fileoverview PinnedMessagesPanel
 * Enterprise-grade pinned messages panel with self-contained data fetching.
 * Shows pinned messages for a conversation. Click to jump to message.
 */

import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  MapPinIcon,
  XMarkIcon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/24/outline";
import { Avatar } from "../common/Avatar";
import { NotificationListSkeleton } from "../ui";
import { usePinnedMessages } from "../../hooks/usePinnedMessages";
import { formatRelativeTime } from "../../utils/formatTime";
import type { Message } from "../../types";

interface PinnedMessagesPanelProps {
  conversationId: string;
  onClose: () => void;
  onJumpToMessage?: (message: Message) => void;
  className?: string;
}

export const PinnedMessagesPanel: React.FC<PinnedMessagesPanelProps> = ({
  conversationId,
  onClose,
  onJumpToMessage,
  className,
}) => {
  const { t } = useTranslation();
  const { pinnedMessages, isLoading, error } =
    usePinnedMessages(conversationId);

  return (
    <div
      className={clsx(
        "flex h-full flex-col bg-surface",
        className,
      )}
      role="region"
      aria-label={t("chat:pinned.title", { defaultValue: "Pinned messages" })}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-border/60 px-4 py-2.5">
        <MapPinIcon className="h-4 w-4 text-primary" />
        <h3 className="flex-1 text-sm font-semibold text-text-primary">
          {t("chat:pinned.title", { defaultValue: "Pinned messages" })}
        </h3>
        {pinnedMessages.length > 0 && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {pinnedMessages.length}
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-text-secondary transition-micro hover:bg-surface-overlay hover:text-text-primary active:scale-95"
          aria-label={t("common:actions.close", { defaultValue: "Close" })}
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Loading */}
        {isLoading && (
          <NotificationListSkeleton count={4} />
        )}

        {/* Error */}
        {error && !isLoading && (
          <div className="px-4 py-4 text-center">
            <p className="text-xs text-danger">{error}</p>
          </div>
        )}

        {/* Empty */}
        {!isLoading && !error && pinnedMessages.length === 0 && (
          <div className="flex flex-col items-center gap-1.5 px-4 py-6 text-center">
            <MapPinIcon className="h-8 w-8 text-text-muted/60" />
            <p className="text-xs font-medium text-text-secondary">
              {t("chat:pinned.empty", { defaultValue: "No pinned messages" })}
            </p>
          </div>
        )}

        {/* Pinned list */}
        {pinnedMessages.map((message, idx) => (
          <button
            key={message.id}
            type="button"
            onClick={() => onJumpToMessage?.(message)}
            className={clsx(
              "group flex w-full items-start gap-3 px-4 py-2.5 text-left",
              "transition-micro hover:bg-surface-overlay",
              "focus-visible:outline-none focus-visible:bg-surface-overlay",
              idx < pinnedMessages.length - 1 && "border-b border-border/30",
            )}
            aria-label={t("chat:pinned.jumpTo", {
              defaultValue: "Jump to message",
            })}
          >
            <Avatar
              src={message.senderAvatar}
              alt={message.senderName ?? ""}
              size="xs"
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
              <p className="mt-0.5 line-clamp-2 text-xs text-text-secondary leading-relaxed">
                {message.content}
              </p>
            </div>
            <ArrowTopRightOnSquareIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-muted/0 transition-micro group-hover:text-text-secondary" />
          </button>
        ))}
      </div>
    </div>
  );
};

export default PinnedMessagesPanel;
