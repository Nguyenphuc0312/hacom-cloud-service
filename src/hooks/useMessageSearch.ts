/**
 * @fileoverview useMessageSearch hook
 * Debounced message search with pagination, loading/error states.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { messageApi } from "../services/api";
import { extractApiError } from "../lib/apiContract";
import { useDebounce } from "./useDebounce";
import type { Message } from "../types";

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
  /** Optional room ID to scope search */
  roomId?: string;
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

export const useMessageSearch = (
  options: UseMessageSearchOptions = {},
): UseMessageSearchReturn => {
  const { debounceMs = 400, limit = 20, roomId } = options;

  const [query, setQuery] = useState("");
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

      setIsLoading(true);
      setError(null);

      try {
        const response = await messageApi.searchMessages({
          q: searchQuery.trim(),
          roomId,
          page: searchPage,
          limit,
        });

        // Guard against stale responses
        if (currentId !== searchIdRef.current) return;

        if (response.success) {
          const data = response.data as MessageSearchResult;
          setResults((prev) =>
            append ? [...prev, ...data.messages] : data.messages,
          );
          setTotal(data.total);
          setPage(searchPage);
        }
      } catch (err) {
        if (currentId !== searchIdRef.current) return;
        const apiErr = extractApiError(err);
        setError(apiErr.message);
      } finally {
        if (currentId === searchIdRef.current) {
          setIsLoading(false);
        }
      }
    },
    [roomId, limit],
  );

  // Trigger search when debounced query changes
  useEffect(() => {
    if (debouncedQuery.trim()) {
      performSearch(debouncedQuery, 1, false);
    } else {
      setResults([]);
      setTotal(0);
      setPage(1);
      setError(null);
      setIsLoading(false);
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
