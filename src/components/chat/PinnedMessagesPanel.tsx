/**
 * @fileoverview PinnedMessagesPanel
 * Shows pinned messages for a room. Click to jump to message.
 */

import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { MapPinIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Avatar } from "../common/Avatar";
import { Spinner } from "../ui";
import { formatRelativeTime } from "../../utils/formatTime";
import type { Message } from "../../types";

interface PinnedMessagesPanelProps {
  pinnedMessages: Message[];
  isLoading: boolean;
  error: string | null;
  onJumpToMessage: (message: Message) => void;
  onClose: () => void;
  className?: string;
}

export const PinnedMessagesPanel: React.FC<PinnedMessagesPanelProps> = ({
  pinnedMessages,
  isLoading,
  error,
  onJumpToMessage,
  onClose,
  className,
}) => {
  const { t } = useTranslation();

  return (
    <div
      className={clsx(
        "flex h-full flex-col border-l border-border bg-surface",
        className,
      )}
      role="region"
      aria-label={t("chat:pinned.title")}
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <MapPinIcon className="h-5 w-5 text-primary" />
        <h3 className="flex-1 text-sm font-semibold text-text-primary">
          {t("chat:pinned.title")}
        </h3>
        {pinnedMessages.length > 0 && (
          <span className="text-xs text-text-muted">
            {t("chat:pinned.count", { count: pinnedMessages.length })}
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 text-text-secondary hover:bg-surface-overlay hover:text-text-primary"
          aria-label={t("common:actions.close")}
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Loading */}
        {isLoading && (
          <div className="flex flex-col items-center gap-3 py-12">
            <Spinner size="md" />
          </div>
        )}

        {/* Error */}
        {error && !isLoading && (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}

        {/* Empty */}
        {!isLoading && !error && pinnedMessages.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
            <MapPinIcon className="h-10 w-10 text-text-muted" />
            <p className="text-sm font-medium text-text-secondary">
              {t("chat:pinned.empty")}
            </p>
            <p className="text-xs text-text-muted">
              {t("chat:pinned.emptyDescription")}
            </p>
          </div>
        )}

        {/* Pinned list */}
        {pinnedMessages.map((message) => (
          <button
            key={message.id}
            type="button"
            onClick={() => onJumpToMessage(message)}
            className={clsx(
              "flex w-full items-start gap-3 border-b border-border/50 px-4 py-3 text-left",
              "transition-colors hover:bg-surface-overlay",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-inset",
            )}
            aria-label={t("chat:pinned.jumpTo")}
          >
            <Avatar
              src={message.sender?.avatar}
              alt={
                message.sender?.displayName ?? message.sender?.username ?? ""
              }
              size="sm"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium text-text-primary">
                  {message.sender?.displayName ??
                    message.sender?.username ??
                    ""}
                </span>
                <span className="shrink-0 text-xs text-text-muted">
                  {formatRelativeTime(new Date(message.createdAt))}
                </span>
              </div>
              <p className="mt-0.5 line-clamp-2 text-sm text-text-secondary">
                {message.content}
              </p>
            </div>
            <MapPinIcon className="mt-1 h-4 w-4 shrink-0 text-primary/60" />
          </button>
        ))}
      </div>
    </div>
  );
};

export default PinnedMessagesPanel;
