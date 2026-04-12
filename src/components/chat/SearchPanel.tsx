/**
 * @fileoverview SearchPanel - Message search modal/panel
 * Opens from ChatHeader search icon. Debounced search with result highlighting,
 * click-to-navigate, paging, loading/error/empty states.
 */

import React, { useCallback, useEffect, useRef } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Spinner } from "../ui";
import { Avatar } from "../common/Avatar";
import { useMessageSearch } from "../../hooks/useMessageSearch";
import { formatRelativeTime } from "../../utils/formatTime";
import type { Message } from "../../types";
import { resolveUserDisplayName } from "../../features/chat/identity/resolveUserDisplayName";

interface SearchPanelProps {
  /** Current conversation ID to scope search (optional) */
  conversationId?: string;
  /** Called when a search result is clicked */
  onSelectMessage: (message: Message) => void;
  /** Close the search panel */
  onClose: () => void;
  className?: string;
}

/** Highlight matching text fragments in message content */
const HighlightedText: React.FC<{ text: string; query: string }> = ({
  text,
  query,
}) => {
  if (!query.trim()) return <>{text}</>;

  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escapedQuery})`, "gi");
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark
            key={i}
            className="rounded bg-warning/30 px-0.5 text-text-primary"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
};

export const SearchPanel: React.FC<SearchPanelProps> = ({
  conversationId,
  onSelectMessage,
  onClose,
  className,
}) => {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const {
    query,
    setQuery,
    results,
    total,
    isLoading,
    error,
    hasMore,
    loadMore,
    reset,
  } = useMessageSearch({ conversationId, debounceMs: 400, limit: 20 });

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Handle keyboard
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [onClose],
  );

  // Infinite scroll handler
  const handleScroll = useCallback(() => {
    if (!listRef.current || isLoading || !hasMore) return;
    const el = listRef.current;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 100) {
      loadMore();
    }
  }, [isLoading, hasMore, loadMore]);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  return (
    <div
      className={clsx(
        "flex h-full flex-col border-l border-border bg-surface",
        className,
      )}
      role="search"
      aria-label={t("chat:search.title")}
      onKeyDown={handleKeyDown}
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <h3 className="flex-1 text-sm font-semibold text-text-primary">
          {t("chat:search.title")}
        </h3>
        <button
          type="button"
          onClick={handleClose}
          className="rounded-full p-1 text-text-secondary hover:bg-surface-overlay hover:text-text-primary"
          aria-label={t("common:actions.close")}
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Search input */}
      <div className="px-4 py-3">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("chat:search.placeholder")}
            className={clsx(
              "w-full rounded-lg border border-border bg-background py-2 pl-9 pr-8 text-sm text-text-primary",
              "placeholder:text-text-muted",
              "focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20",
            )}
            aria-label={t("chat:search.placeholder")}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-text-muted hover:text-text-secondary"
              aria-label={t("common:actions.clear")}
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Results area */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto"
        onScroll={handleScroll}
      >
        {/* Loading state */}
        {isLoading && results.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-12">
            <Spinner size="md" />
            <p className="text-sm text-text-muted">
              {t("common:loading.default")}
            </p>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-danger">{t("chat:search.error")}</p>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && query.trim() && results.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
            <MagnifyingGlassIcon className="h-10 w-10 text-text-muted" />
            <p className="text-sm font-medium text-text-secondary">
              {t("chat:search.noResults")}
            </p>
            <p className="text-xs text-text-muted">
              {t("chat:search.noResultsDescription")}
            </p>
          </div>
        )}

        {/* Results count */}
        {results.length > 0 && (
          <p className="px-4 pb-1 text-xs text-text-muted">
            {t("chat:search.resultCount", { count: total })}
          </p>
        )}

        {/* Results list */}
        {results.map((message) => {
          const senderDisplayName = resolveUserDisplayName({
            displayName: message.senderName,
            username: message.senderId,
          });

          return (
            <button
              key={message.id}
              type="button"
              onClick={() => onSelectMessage(message)}
              className={clsx(
                "flex w-full items-start gap-3 px-4 py-3 text-left",
                "transition-colors hover:bg-surface-overlay",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-inset",
              )}
            >
              <Avatar
                src={message.senderAvatar}
                alt={senderDisplayName}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium text-text-primary">
                    {senderDisplayName}
                  </span>
                  <span className="shrink-0 text-xs text-text-muted">
                    {formatRelativeTime(new Date(message.createdAt))}
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-sm text-text-secondary">
                  <HighlightedText text={message.content} query={query} />
                </p>
              </div>
            </button>
          );
        })}

        {/* Loading more indicator */}
        {isLoading && results.length > 0 && (
          <div className="flex justify-center py-3">
            <Spinner size="sm" />
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchPanel;
