/**
 * @fileoverview SearchPanel - Message search modal/panel
 * Opens from ChatHeader search icon. Debounced search with result highlighting,
 * click-to-navigate, paging, loading/error/empty states.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { NotificationListSkeleton, Skeleton } from "../ui";
import { Avatar } from "../common/Avatar";
import { useMessageSearch } from "../../hooks/useMessageSearch";
import { formatRelativeTime } from "../../utils/formatTime";
import { getMessageSearchPreview } from "../../utils/messageLengthPolicy";
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

const QUERY_SCOPE_ALL = "__all__";
const searchQueryByScope = new Map<string, string>();

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
  const queryScope = conversationId ?? QUERY_SCOPE_ALL;
  const initialQuery = useMemo(
    () => searchQueryByScope.get(queryScope) ?? "",
    [queryScope],
  );
  const [activeIndex, setActiveIndex] = useState(0);

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
  } = useMessageSearch({
    conversationId,
    debounceMs: 400,
    initialQuery,
    limit: 20,
  });
  const safeActiveIndex =
    results.length === 0 ? 0 : Math.min(activeIndex, results.length - 1);

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    searchQueryByScope.set(queryScope, query);
  }, [query, queryScope]);

  const jumpToResult = useCallback(
    (index: number) => {
      const message = results[index];
      if (!message) return;
      setActiveIndex(index);
      onSelectMessage(message);
    },
    [onSelectMessage, results],
  );

  const goToPrevious = useCallback(() => {
    if (results.length === 0) return;
    const nextIndex =
      safeActiveIndex <= 0 ? results.length - 1 : safeActiveIndex - 1;
    jumpToResult(nextIndex);
  }, [jumpToResult, results.length, safeActiveIndex]);

  const goToNext = useCallback(() => {
    if (results.length === 0) return;
    if (safeActiveIndex >= results.length - 1 && hasMore) {
      void loadMore();
      return;
    }
    const nextIndex =
      safeActiveIndex >= results.length - 1 ? 0 : safeActiveIndex + 1;
    jumpToResult(nextIndex);
  }, [hasMore, jumpToResult, loadMore, results.length, safeActiveIndex]);

  // Handle keyboard
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (query.trim()) {
          setQuery("");
        } else {
          onClose();
        }
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey) {
          goToPrevious();
        } else {
          goToNext();
        }
      }
    },
    [goToNext, goToPrevious, onClose, query, setQuery],
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
    onClose();
  }, [onClose]);

  const handleClear = useCallback(() => {
    reset();
    searchQueryByScope.delete(queryScope);
    setActiveIndex(0);
  }, [queryScope, reset]);

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
              onClick={handleClear}
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
          <NotificationListSkeleton count={5} />
        )}

        {/* Error state */}
        {error && (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-danger">{t("chat:search.error")}</p>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && query.trim() && results.length === 0 && (
          <div className="px-4 py-6 text-center">
            <p className="text-sm text-text-secondary">
              {t("chat:search.noResults")}
            </p>
          </div>
        )}

        {/* Results count */}
        {results.length > 0 && (
          <div className="sticky top-0 z-10 flex items-center justify-between border-y border-border/70 bg-surface/95 px-4 py-2 backdrop-blur">
            <p className="text-xs font-medium text-text-muted">
              {safeActiveIndex + 1}/{total || results.length}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={goToPrevious}
                className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                aria-label={t("chat:search.previousResult", {
                  defaultValue: "Previous result",
                })}
              >
                <ChevronUpIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={goToNext}
                className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                aria-label={t("chat:search.nextResult", {
                  defaultValue: "Next result",
                })}
              >
                <ChevronDownIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Results list */}
        {results.map((message, index) => {
          const senderDisplayName = resolveUserDisplayName({
            displayName: message.senderName,
            username: message.senderId,
          });
          const isActive = index === safeActiveIndex;
          const preview = getMessageSearchPreview(message.content ?? "", query);

          return (
            <button
              key={message.id}
              type="button"
              onClick={() => jumpToResult(index)}
              className={clsx(
                "flex w-full items-start gap-3 px-4 py-3 text-left",
                "transition-colors hover:bg-surface-overlay",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-inset",
                isActive && "bg-primary/8",
              )}
              aria-current={isActive ? "true" : undefined}
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
                  <HighlightedText text={preview} query={query} />
                </p>
              </div>
            </button>
          );
        })}

        {/* Loading more indicator */}
        {isLoading && results.length > 0 && (
          <div
            className="flex justify-center py-3"
            aria-busy="true"
            aria-label={t("common:loading.default")}
            role="status"
          >
            <Skeleton className="h-3 w-28" rounded="full" />
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchPanel;
