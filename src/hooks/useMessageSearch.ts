/**
 * @fileoverview useMessageSearch hook
 * Debounced message search with pagination, loading/error states.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { messageApi } from "../services/api";
import { extractApiError } from "../lib/apiContract";
import { useDebounce } from "./useDebounce";
import type { Message } from "../types";
import { ExpiringLruCache } from "../utils/expiringLruCache";

interface MessageSearchResult {
  messages: Message[];
  total: number;
  page: number;
  limit: number;
}

interface UseMessageSearchOptions {
  /** Debounce delay in ms (default: 400) */
  debounceMs?: number;
  /** Results per page (default: 20) */
  limit?: number;
  /** Optional conversation ID to scope search (omit → global across the user's conversations) */
  conversationId?: string;
  /** Optional server-side filter: only messages from this sender */
  senderId?: string | null;
  /** Optional server-side date range (ISO datetime with offset) */
  from?: string | null;
  to?: string | null;
  /** Optional initial query, used when a panel restores per-conversation state */
  initialQuery?: string;
}

interface UseMessageSearchReturn {
  query: string;
  setQuery: (q: string) => void;
  results: Message[];
  total: number;
  page: number;
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  reset: () => void;
}

const SEARCH_RESULT_CACHE = new ExpiringLruCache<MessageSearchResult>({
  maxEntries: 80,
});
const SEARCH_RESULT_TTL_MS = 30_000;

const buildSearchCacheKey = (params: {
  conversationId?: string;
  query: string;
  page: number;
  limit: number;
  senderId?: string | null;
  from?: string | null;
  to?: string | null;
}): string =>
  [
    params.conversationId ?? "all",
    params.query.trim().toLowerCase(),
    params.senderId ?? "",
    params.from ?? "",
    params.to ?? "",
    params.page,
    params.limit,
  ].join(":");

export const useMessageSearch = (
  options: UseMessageSearchOptions = {},
): UseMessageSearchReturn => {
  const { debounceMs = 400, limit = 20 } = options;
  const conversationId = options.conversationId;
  const senderId = options.senderId ?? undefined;
  const from = options.from ?? undefined;
  const to = options.to ?? undefined;

  const [query, setQuery] = useState(() => options.initialQuery ?? "");
  const [results, setResults] = useState<Message[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debouncedQuery = useDebounce(query, debounceMs);
  const abortRef = useRef<AbortController | null>(null);
  const searchIdRef = useRef(0);

  const performSearch = useCallback(
    async (searchQuery: string, searchPage: number, append = false) => {
      if (!searchQuery.trim()) {
        setResults([]);
        setTotal(0);
        setPage(1);
        setError(null);
        return;
      }

      const currentId = ++searchIdRef.current;
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const normalizedQuery = searchQuery.trim();
      const cacheKey = buildSearchCacheKey({
        conversationId,
        query: normalizedQuery,
        page: searchPage,
        limit,
        senderId,
        from,
        to,
      });

      if (!append) {
        const cached = SEARCH_RESULT_CACHE.get(cacheKey);
        if (cached) {
          setResults(cached.messages);
          setTotal(cached.total);
          setPage(searchPage);
          setError(null);
          setIsLoading(false);
          return;
        }
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await messageApi.searchMessages({
          q: normalizedQuery,
          conversationId,
          senderId,
          from,
          to,
          page: searchPage,
          limit,
          signal: abortRef.current.signal,
        });

        // Guard against stale responses
        if (currentId !== searchIdRef.current) return;

        if (response.success) {
          const data = response.data as MessageSearchResult;
          SEARCH_RESULT_CACHE.set(
            cacheKey,
            data,
            Date.now() + SEARCH_RESULT_TTL_MS,
          );
          setResults((prev) =>
            append ? [...prev, ...data.messages] : data.messages,
          );
          setTotal(data.total);
          setPage(searchPage);
        }
      } catch (err) {
        if (currentId !== searchIdRef.current) return;
        if (
          err instanceof Error &&
          (err.name === "AbortError" || err.message === "canceled")
        ) {
          return;
        }
        const apiErr = extractApiError(err);
        setError(apiErr.message);
      } finally {
        if (currentId === searchIdRef.current) {
          setIsLoading(false);
        }
      }
    },
    [conversationId, limit, senderId, from, to],
  );

  // Trigger search when debounced query changes
  const [prevDebouncedQuery, setPrevDebouncedQuery] = useState(debouncedQuery);

  if (debouncedQuery !== prevDebouncedQuery) {
    setPrevDebouncedQuery(debouncedQuery);
    if (!debouncedQuery.trim()) {
      setResults([]);
      setTotal(0);
      setPage(1);
      setError(null);
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (debouncedQuery.trim()) {
      performSearch(debouncedQuery, 1, false);
    }
  }, [debouncedQuery, performSearch]);

  const loadMore = useCallback(async () => {
    if (isLoading || results.length >= total) return;
    await performSearch(debouncedQuery, page + 1, true);
  }, [isLoading, results.length, total, debouncedQuery, page, performSearch]);

  const reset = useCallback(() => {
    searchIdRef.current++;
    abortRef.current?.abort();
    setQuery("");
    setResults([]);
    setTotal(0);
    setPage(1);
    setIsLoading(false);
    setError(null);
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return {
    query,
    setQuery,
    results,
    total,
    page,
    isLoading,
    error,
    hasMore: results.length < total,
    loadMore,
    reset,
  };
};

export default useMessageSearch;
