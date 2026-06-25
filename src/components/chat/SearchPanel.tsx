/**
 * @fileoverview SearchPanel - Message search modal/panel
 * Opens from ChatHeader search icon. Debounced search with result highlighting,
 * click-to-navigate, paging, loading/error/empty states.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDebouncedCallback } from "../../hooks/useDebounce";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  ExclamationCircleIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { NotificationListSkeleton, Skeleton } from "../ui";
import { Avatar } from "../common/Avatar";
import { useMessageSearch } from "../../hooks/useMessageSearch";
import {
  useGetConversationByIdQuery,
  useGetConversationFilesQuery,
} from "../../features/api/chatApi";
import type { ConversationResourcesFileItem } from "../../features/api/chatApi";
import { useDebounce } from "../../hooks/useDebounce";
import { formatRelativeTime } from "../../utils/formatTime";
import { getMessageSearchPreview } from "../../utils/messageLengthPolicy";
import { formatFileSize, getFileIconType } from "../../utils/formatFileSize";
import { FileTypeIcon } from "../message/FileTypeIcon";
import { FileName } from "../common/FileName";
import { resolvePublicResourceUrl } from "../../config";
import type { Message } from "../../types";
import { resolveUserDisplayName } from "../../features/chat/identity/resolveUserDisplayName";
import { useEnrichedProfileStore } from "../../stores/enrichedProfileStore";

interface SearchPanelProps {
  /** Current conversation ID to scope search (optional) */
  conversationId?: string;
  /** Called when a message search result is clicked */
  onSelectMessage: (message: Message) => void;
  /** Called when a file result is clicked — jumps to the owning message by id */
  onNavigateToMessageId: (messageId: string) => void;
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

/**
 * A file search result row — icon, name, meta. Clicking jumps to the message
 * that contains the file (not a download); the long base name truncates while
 * the extension stays visible (e.g. "DanhSachDiemDanh….xlsx").
 */
const FileResultRow: React.FC<{
  item: ConversationResourcesFileItem;
  onNavigate: (messageId: string) => void;
}> = ({ item, onNavigate }) => {
  const { t } = useTranslation();
  const iconType = getFileIconType(item.mimeType, item.fileName);
  const date = formatRelativeTime(new Date(item.createdAt));

  return (
    <button
      type="button"
      onClick={() => onNavigate(item.messageId)}
      title={item.fileName}
      aria-label={t("chat:search.jumpToFileMessage", {
        defaultValue: "Jump to message",
      })}
      className={clsx(
        "flex w-full items-center gap-3 px-4 py-2.5 text-left",
        "transition-colors hover:bg-surface-overlay",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1976D2]/30 focus-visible:ring-inset",
      )}
    >
      <FileTypeIcon type={iconType} className="h-9 w-9 shrink-0" />
      <div className="min-w-0 flex-1">
        <FileName
          name={item.fileName}
          className="text-sm font-medium text-text-primary"
        />
        <p className="truncate text-xs text-text-muted">
          {formatFileSize(item.sizeBytes)} · {item.senderName} · {date}
        </p>
      </div>
    </button>
  );
};

export const SearchPanel: React.FC<SearchPanelProps> = ({
  conversationId,
  onSelectMessage,
  onNavigateToMessageId,
  onClose,
  className,
}) => {
  const { t } = useTranslation();
  const nameByUserId = useEnrichedProfileStore((s) => s.nameByUserId);
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
    limit: 10,
  });

  const MESSAGE_PREVIEW_COUNT = 10;
  const [showAllMessages, setShowAllMessages] = useState(false);
  const visibleResults = showAllMessages
    ? results
    : results.slice(0, MESSAGE_PREVIEW_COUNT);
  // More to show when the user hasn't expanded yet AND there are extra results
  // (either already loaded beyond 10, or more pages available on the server).
  const hasMoreMessages =
    !showAllMessages &&
    (results.length > MESSAGE_PREVIEW_COUNT || hasMore);

  const safeActiveIndex =
    results.length === 0 ? 0 : Math.min(activeIndex, results.length - 1);

  // The search endpoint does not populate sender avatars, so fall back to the
  // conversation participants (same source the timeline uses) keyed by senderId.
  const { data: conversation } = useGetConversationByIdQuery(
    conversationId ?? "",
    { skip: !conversationId },
  );
  const participantById = useMemo(() => {
    const map: Record<string, { avatar?: string; displayName?: string }> = {};
    const participants = conversation?.participants ?? [];
    for (const participant of participants) {
      if (!participant.id) continue;
      map[participant.id] = {
        avatar: participant.avatar ?? undefined,
        displayName: participant.displayName ?? undefined,
      };
    }
    return map;
  }, [conversation?.participants]);

  // File results (same query box) — mirrors Zalo's "File" section below messages.
  const FILE_PREVIEW_COUNT = 5;
  const [showAllFiles, setShowAllFiles] = useState(false);
  const debouncedQuery = useDebounce(query, 400);
  const trimmedQuery = debouncedQuery.trim();
  const { data: fileData, isFetching: isFilesFetching } =
    useGetConversationFilesQuery(
      {
        conversationId: conversationId ?? "",
        q: trimmedQuery,
        limit: showAllFiles ? 50 : FILE_PREVIEW_COUNT,
      },
      { skip: !conversationId || trimmedQuery.length === 0 },
    );
  const fileResults = fileData?.data ?? [];
  const fileTotal = fileData?.pagination.total ?? 0;
  const hasMoreFiles = !showAllFiles && fileTotal > fileResults.length;

  // A new keyword starts the file list collapsed again (derive during render
  // instead of an effect to avoid a cascading re-render).
  const [prevFileQuery, setPrevFileQuery] = useState(trimmedQuery);
  if (trimmedQuery !== prevFileQuery) {
    setPrevFileQuery(trimmedQuery);
    if (showAllFiles) setShowAllFiles(false);
    if (showAllMessages) setShowAllMessages(false);
  }

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
    if (nextIndex >= MESSAGE_PREVIEW_COUNT) setShowAllMessages(true);
    jumpToResult(nextIndex);
  }, [jumpToResult, results.length, safeActiveIndex]);

  const goToNext = useCallback(() => {
    if (results.length === 0) return;
    if (safeActiveIndex >= results.length - 1 && hasMore) {
      setShowAllMessages(true);
      void loadMore();
      return;
    }
    const nextIndex =
      safeActiveIndex >= results.length - 1 ? 0 : safeActiveIndex + 1;
    if (nextIndex >= MESSAGE_PREVIEW_COUNT) setShowAllMessages(true);
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

  // Infinite scroll — only active AFTER the user expanded the list via "Show
  // more". Before that the 10-item preview is fixed and the button controls
  // expansion (so the File section below stays reachable).
  const handleScrollRaw = useCallback(() => {
    if (!listRef.current || isLoading || !hasMore || !showAllMessages) return;
    const el = listRef.current;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 100) {
      loadMore();
    }
  }, [isLoading, hasMore, loadMore, showAllMessages]);

  const handleScroll = useDebouncedCallback(handleScrollRaw, 100);

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
      className={clsx("flex h-full flex-col bg-surface", className)}
      role="search"
      aria-label={t("chat:search.title")}
      onKeyDown={handleKeyDown}
    >
      {/* Header — matches the info panel (GroupInfo) header */}
      <div className="sticky top-0 z-10 flex h-12 shrink-0 items-center justify-between border-b border-border bg-surface/95 px-4 backdrop-blur-sm">
        <h3 className="text-sm font-bold text-text-primary">
          {t("chat:search.title")}
        </h3>
        <button
          type="button"
          onClick={handleClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
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
              "focus:border-[#1976D2]/60 focus:outline-none focus:ring-2 focus:ring-[#1976D2]/15",
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
          <div className="flex flex-col items-center px-8 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10">
              <ExclamationCircleIcon className="h-6 w-6 text-danger" />
            </div>
            <p className="mt-4 text-sm font-medium text-text-primary">
              {t("chat:search.error")}
            </p>
          </div>
        )}

        {/* Idle state — panel just opened, no query yet */}
        {!isLoading && !error && !query.trim() && (
          <div className="flex flex-col items-center px-8 pb-12 pt-16 text-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#1976D2]/10">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#1976D2]/20">
                <MagnifyingGlassIcon
                  className="h-8 w-8 text-[#1565C0]"
                  strokeWidth={1.5}
                />
              </div>
            </div>
            <p className="mt-5 text-sm font-semibold text-text-primary">
              {t("chat:search.idleTitle")}
            </p>
            <p className="mt-1.5 max-w-[17rem] text-xs leading-relaxed text-text-muted">
              {t("chat:search.idleDescription")}
            </p>
          </div>
        )}

        {/* Empty state — query entered, no message AND no file matches */}
        {!isLoading &&
          !isFilesFetching &&
          !error &&
          query.trim() &&
          results.length === 0 &&
          fileResults.length === 0 && (
          <div className="flex flex-col items-center px-8 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-overlay">
              <MagnifyingGlassIcon className="h-6 w-6 text-text-muted" />
            </div>
            <p className="mt-4 text-sm font-medium text-text-primary">
              {t("chat:search.noResults")}
            </p>
            <p className="mt-1 text-xs text-text-muted">
              {t("chat:search.noResultsDescription")}
            </p>
          </div>
        )}

        {/* Results count */}
        {results.length > 0 && (
          <div className="sticky top-0 z-10 flex items-center border-y border-border/70 bg-surface/95 px-4 py-2 backdrop-blur">
            <p className="text-xs font-medium text-text-secondary">
              <span className="text-text-primary">{safeActiveIndex + 1}</span>
              <span className="text-text-muted">
                {" / "}
                {t("chat:search.resultCount", {
                  count: total || results.length,
                })}
              </span>
            </p>
          </div>
        )}

        {/* Messages section header */}
        {results.length > 0 && (
          <p className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
            {t("chat:search.sectionMessages")}
          </p>
        )}

        {/* Results list — capped at 10 until "Show more" is pressed */}
        {visibleResults.map((message, index) => {
          const participant = participantById[message.senderId];
          const senderDisplayName =
            nameByUserId[message.senderId] ??
            resolveUserDisplayName({
              displayName: message.senderName ?? participant?.displayName,
              username: message.senderId,
            });
          const isActive = index === safeActiveIndex;
          const preview = getMessageSearchPreview(message.content ?? "", query);
          const senderAvatar = resolvePublicResourceUrl(
            message.senderAvatar ?? participant?.avatar ?? undefined,
          );

          return (
            <button
              key={message.id}
              type="button"
              onClick={() => jumpToResult(index)}
              className={clsx(
                "flex w-full items-start gap-3 px-4 py-3 text-left",
                "transition-colors hover:bg-surface-overlay",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1976D2]/30 focus-visible:ring-inset",
                isActive && "bg-[#1976D2]/10",
              )}
              aria-current={isActive ? "true" : undefined}
            >
              <Avatar src={senderAvatar} alt={senderDisplayName} size="sm" />
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

        {/* Show more (messages) — reveals the rest below the first 10 */}
        {hasMoreMessages && (
          <button
            type="button"
            onClick={() => {
              setShowAllMessages(true);
              if (results.length <= MESSAGE_PREVIEW_COUNT && hasMore) {
                void loadMore();
              }
            }}
            className="mx-4 my-2 flex w-[calc(100%-2rem)] items-center justify-center rounded-lg border border-border bg-surface-overlay/40 py-2 text-sm font-medium text-[#1565C0] transition-colors hover:bg-[#1976D2]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1976D2]/30"
          >
            {t("chat:search.showMore")}
          </button>
        )}

        {/* Loading more indicator (messages) */}
        {isLoading && showAllMessages && results.length > 0 && (
          <div
            className="flex justify-center py-3"
            aria-busy="true"
            aria-label={t("common:loading.default")}
            role="status"
          >
            <Skeleton className="h-3 w-28" rounded="full" />
          </div>
        )}

        {/* File section — mirrors Zalo's "File" group below messages */}
        {fileResults.length > 0 && (
          <div className="mt-1 border-t border-border/60 pt-1">
            <p className="px-4 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
              {t("chat:search.sectionFiles")}
            </p>
            {fileResults.map((item) => (
              <FileResultRow
                key={item.messageId + item.fileId}
                item={item}
                onNavigate={onNavigateToMessageId}
              />
            ))}
            {hasMoreFiles && (
              <button
                type="button"
                onClick={() => setShowAllFiles(true)}
                className="mx-4 my-2 flex w-[calc(100%-2rem)] items-center justify-center rounded-lg border border-border bg-surface-overlay/40 py-2 text-sm font-medium text-[#1565C0] transition-colors hover:bg-[#1976D2]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1976D2]/30"
              >
                {t("chat:search.showMore")}
              </button>
            )}
          </div>
        )}

        {/* Files loading skeleton */}
        {isFilesFetching && fileResults.length === 0 && trimmedQuery && (
          <div className="flex justify-center py-3" role="status" aria-busy="true">
            <Skeleton className="h-3 w-24" rounded="full" />
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchPanel;
