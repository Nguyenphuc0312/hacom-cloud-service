import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { ChevronDownIcon } from "@heroicons/react/24/solid";
import { ConversationLane } from "../layout/ConversationLane";
import { formatDateDivider } from "../../utils/formatTime";

interface MessageListOverlaysProps {
  hasMessages: boolean;
  historyLoadingState?: {
    stage:
      | "empty"
      | "partial_unread_bootstrap"
      | "partial_prefetch"
      | "authoritative_initial_window"
      | "paginating_older"
      | "live_realtime";
    isPartial: boolean;
  } | null;
  stickyDate: Date | null;
  showStickyDate: boolean;
  showError: boolean;
  error: string | null;
  canRetry: boolean;
  onRetry?: () => void;
  retryLabel: string;
  showLoadingMore: boolean;
  loadMoreLabel: string;
  showJumpToBottom: boolean;
  showNewMessagesPill: boolean;
  pendingNewMessages: number;
  onJumpToLatest: () => void;
  jumpToLatestLabel: string;
  newMessagesAriaLabel: string;
  newMessagesLabel: string;
  floatingBottomOffset: number;
}

export const MessageListOverlays = React.memo(
  ({
    hasMessages,
    historyLoadingState,
    stickyDate,
    showStickyDate,
    showError,
    error,
    canRetry,
    onRetry,
    retryLabel,
    showLoadingMore,
    loadMoreLabel,
    showJumpToBottom,
    showNewMessagesPill,
    pendingNewMessages,
    onJumpToLatest,
    jumpToLatestLabel,
    newMessagesAriaLabel,
    newMessagesLabel,
    floatingBottomOffset,
  }: MessageListOverlaysProps) => {
    const { t } = useTranslation();
    const showBottomFloating = showJumpToBottom || showNewMessagesPill;

    return (
      <>
        {hasMessages && stickyDate && showStickyDate && (
          <div className="pointer-events-none absolute left-1/2 top-3 z-[5] -translate-x-1/2">
            <div
              className="rounded-full border px-3.5 py-1 text-[11px] font-medium text-text-secondary shadow-xs backdrop-blur"
              style={{
                backgroundColor: "hsl(var(--color-chat-pill) / 0.94)",
                borderColor: "hsl(var(--color-chat-pill-border) / 0.7)",
              }}
            >
              {formatDateDivider(stickyDate)}
            </div>
          </div>
        )}

        {showError && error && (
          <div className="pointer-events-none absolute inset-x-[var(--chat-lane-padding)] top-2 z-sticky flex justify-center">
            <div className="pointer-events-auto flex max-w-full items-center gap-2 rounded-full border border-danger/25 bg-surface/95 px-3 py-1 shadow-xs backdrop-blur">
              <span className="truncate text-xs text-danger">{error}</span>
              {canRetry && onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="rounded-full px-2 py-0.5 text-xs font-medium text-primary transition-micro hover:bg-surface-overlay active:scale-95"
                >
                  {retryLabel}
                </button>
              )}
            </div>
          </div>
        )}

        {showLoadingMore && (
          <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-full border border-border bg-surface/90 px-4 py-1.5 text-xs text-text-secondary shadow-xs animate-slide-up-fade">
            {loadMoreLabel}
          </div>
        )}

        {hasMessages && historyLoadingState?.isPartial && (
          <div className="pointer-events-none absolute inset-x-[var(--chat-lane-padding)] top-11 z-[4] flex justify-center">
            <div className="rounded-full border border-primary/20 bg-surface/95 px-3 py-1 text-xs text-text-secondary shadow-xs backdrop-blur">
              {t("chat:message.loadingMoreHistory")}
            </div>
          </div>
        )}

        {showBottomFloating && (
          <div
            className="pointer-events-none absolute inset-x-0 z-[12]"
            style={{
              bottom: `calc(env(safe-area-inset-bottom) + ${floatingBottomOffset}px)`,
            }}
          >
            <ConversationLane>
              <div className="flex justify-end">
                <div className="pointer-events-auto flex items-center">
                  {showJumpToBottom && (
                    <button
                      type="button"
                      onClick={onJumpToLatest}
                      className={clsx(
                        "flex h-10 w-10 items-center justify-center rounded-full border border-white/8 bg-[hsl(var(--color-chat-pill))] shadow-xs",
                        "transition-micro hover:bg-white/10 hover:shadow-elev1",
                        "active:scale-95",
                        "animate-slide-up-fade",
                      )}
                      aria-label={jumpToLatestLabel}
                    >
                      <ChevronDownIcon className="h-5 w-5 text-text-secondary" />
                    </button>
                  )}

                  {showNewMessagesPill && (
                    <button
                      type="button"
                      onClick={onJumpToLatest}
                      className={clsx(
                        "flex min-h-10 items-center justify-center gap-2 rounded-full border border-white/8 bg-[hsl(var(--color-chat-pill))] px-3 shadow-xs",
                        "transition-micro hover:bg-white/10 hover:shadow-elev1",
                        "active:scale-95",
                        "animate-slide-up-fade",
                        showJumpToBottom && "ml-2",
                      )}
                      aria-label={newMessagesAriaLabel}
                      data-pending-messages={pendingNewMessages}
                    >
                      <ChevronDownIcon className="h-5 w-5 text-text-secondary" />
                      <span className="text-xs font-medium text-text-primary">
                        {newMessagesLabel}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </ConversationLane>
          </div>
        )}
      </>
    );
  },
);

MessageListOverlays.displayName = "MessageListOverlays";

export default MessageListOverlays;
