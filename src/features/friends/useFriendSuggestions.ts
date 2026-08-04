/**
 * @fileoverview useFriendSuggestions hook
 * Phân trang "Gợi ý kết bạn" từ GET /friends/suggestions (ranked + filtered ở backend).
 * Lớp filter bảo vệ cuối cùng (filterFriendSuggestions) vẫn nằm ở component.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { FriendSuggestionDto } from "@hacom/chat-shared-types/chat";
import { FRIEND_SUGGESTIONS_PAGE_SIZE, friendshipApi } from "../../services/api";
import { extractApiError, unwrapApiSuccess } from "../../lib/apiContract";

interface SuggestionPageMeta {
  page: number;
  hasNext: boolean;
  total: number;
}

const readPageMeta = (meta: unknown, fallbackPage: number): SuggestionPageMeta => {
  if (meta && typeof meta === "object") {
    const record = meta as Record<string, unknown>;
    const page = typeof record.page === "number" ? record.page : fallbackPage;
    const hasNext = typeof record.hasNext === "boolean" ? record.hasNext : false;
    const total = typeof record.total === "number" ? record.total : 0;
    return { page, hasNext, total };
  }
  return { page: fallbackPage, hasNext: false, total: 0 };
};

const appendUnique = (
  existing: FriendSuggestionDto[],
  incoming: FriendSuggestionDto[],
): FriendSuggestionDto[] => {
  const seen = new Set(existing.map((item) => item.id));
  const next = [...existing];
  for (const item of incoming) {
    if (!item.id || seen.has(item.id)) continue;
    seen.add(item.id);
    next.push(item);
  }
  return next;
};

const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException
    ? error.name === "AbortError"
    : Boolean(
        error &&
          typeof error === "object" &&
          (error as { code?: unknown }).code === "ERR_CANCELED",
      );

export interface UseFriendSuggestionsResult {
  suggestions: FriendSuggestionDto[];
  hasLoaded: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasNext: boolean;
  total: number;
  error: string | null;
  loadMoreError: string | null;
  loadMore: () => Promise<void>;
  reload: () => Promise<void>;
  removeSuggestion: (userId: string) => void;
}

export const useFriendSuggestions = (
  options: { enabled?: boolean } = {},
): UseFriendSuggestionsResult => {
  const enabled = options.enabled ?? true;

  const [suggestions, setSuggestions] = useState<FriendSuggestionDto[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasNext, setHasNext] = useState(false);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  const pageRef = useRef(0);
  const inFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const hasNextRef = useRef(false);

  const fetchPage = useCallback(async (page: number) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    const controller = new AbortController();
    abortRef.current = controller;
    const isInitial = page === 1;

    if (isInitial) {
      setIsLoading(true);
      setError(null);
    } else {
      setIsLoadingMore(true);
      setLoadMoreError(null);
    }

    try {
      const response = await friendshipApi.getSuggestions(
        page,
        FRIEND_SUGGESTIONS_PAGE_SIZE,
        { signal: controller.signal },
      );
      const data = unwrapApiSuccess(response);
      const meta = readPageMeta(
        response.success ? response.meta : undefined,
        page,
      );
      if (controller.signal.aborted) return;

      pageRef.current = meta.page;
      hasNextRef.current = meta.hasNext;
      setHasNext(meta.hasNext);
      setTotal(meta.total);
      setSuggestions((previous) =>
        isInitial ? appendUnique([], data) : appendUnique(previous, data),
      );
    } catch (caught) {
      if (controller.signal.aborted || isAbortError(caught)) return;
      const apiError = extractApiError(caught);
      if (isInitial) {
        setError(apiError.message);
      } else {
        setLoadMoreError(apiError.message);
      }
    } finally {
      // Một request bị abort đã bị thay thế (reload/unmount) — không được
      // đụng vào flags của request mới hơn.
      const isCurrent = abortRef.current === controller;
      if (isCurrent) {
        abortRef.current = null;
        inFlightRef.current = false;
        if (isInitial) {
          setIsLoading(false);
          setHasLoaded(true);
        } else {
          setIsLoadingMore(false);
        }
      }
    }
  }, []);

  const reload = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = null;
    inFlightRef.current = false;
    setIsLoadingMore(false);
    setLoadMoreError(null);
    pageRef.current = 0;
    hasNextRef.current = false;
    await fetchPage(1);
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (inFlightRef.current || !hasNextRef.current || pageRef.current < 1) {
      return;
    }
    await fetchPage(pageRef.current + 1);
  }, [fetchPage]);

  const removeSuggestion = useCallback((userId: string) => {
    setSuggestions((previous) =>
      previous.filter((item) => item.id !== userId),
    );
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => {
      void reload();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      abortRef.current?.abort();
      abortRef.current = null;
      inFlightRef.current = false;
    };
  }, [enabled, reload]);

  return {
    suggestions,
    hasLoaded,
    isLoading,
    isLoadingMore,
    hasNext,
    total,
    error,
    loadMoreError,
    loadMore,
    reload,
    removeSuggestion,
  };
};

export default useFriendSuggestions;
