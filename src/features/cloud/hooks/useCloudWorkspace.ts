import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cloudApi, CloudApiError } from "../api/cloudApi";
import type {
  CloudHealth,
  CloudFilter,
  CloudItem,
  CloudPage,
  CloudQuota,
  CloudQuotaRequest,
  CloudUploadProgress,
} from "../types";
import {
  getCachedCloudFileAccess,
  invalidateCloudFileAccess,
} from "../utils/cloudFileAccessCache";

const PROCESSING_REFRESH_MS = 2_000;

interface CloudWorkspaceState {
  items: CloudItem[];
  trashItems: CloudItem[];
  quota: CloudQuota | null;
  quotaRequest: CloudQuotaRequest | null;
  health: CloudHealth | null;
  isLoading: boolean;
  isRefreshing: boolean;
  isLoadingMore: boolean;
  isLoadingTrash: boolean;
  isLoadingMoreTrash: boolean;
  isMutating: boolean;
  isRequestingQuota: boolean;
  error: CloudApiError | null;
  nextCursor?: string;
  trashNextCursor?: string;
  uploadProgress: CloudUploadProgress | null;
}

const initialState: CloudWorkspaceState = {
  items: [],
  trashItems: [],
  quota: null,
  quotaRequest: null,
  health: null,
  isLoading: true,
  isRefreshing: false,
  isLoadingMore: false,
  isLoadingTrash: true,
  isLoadingMoreTrash: false,
  isMutating: false,
  isRequestingQuota: false,
  error: null,
  uploadProgress: null,
};

const asCloudError = (error: unknown): CloudApiError => {
  if (error instanceof CloudApiError) return error;
  return new CloudApiError({
    status: 0,
    code: "CLOUD_NETWORK_ERROR",
    message: error instanceof Error ? error.message : "Cloud request failed",
  });
};

const createMissingUserError = (): CloudApiError =>
  new CloudApiError({
    status: 401,
    code: "CLOUD_USER_MISSING",
    message: "Current user ID is unavailable",
  });

const mergeItems = (
  current: CloudItem[],
  incoming: CloudItem[],
): CloudItem[] => {
  const byId = new Map(current.map((item) => [item.id, item]));
  incoming.forEach((item) => byId.set(item.id, item));
  return Array.from(byId.values()).sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
};

const mergeTrashItems = (
  current: CloudItem[],
  incoming: CloudItem[],
): CloudItem[] => {
  const byId = new Map(current.map((item) => [item.id, item]));
  incoming.forEach((item) => byId.set(item.id, item));
  return Array.from(byId.values()).sort((left, right) => {
    const leftTime = new Date(left.deletedAt ?? left.createdAt).getTime();
    const rightTime = new Date(right.deletedAt ?? right.createdAt).getTime();
    return rightTime - leftTime;
  });
};

const ACCESS_REQUEST_CONCURRENCY = 4;

const hydrateMediaAccess = async (
  items: CloudItem[],
  userId: string,
  signal?: AbortSignal,
  allowedStatus: CloudItem["status"] = "ready",
): Promise<CloudItem[]> => {
  const hydrated = [...items];
  const candidates = items
    .map((item, index) => ({ item, index }))
    .filter(
      ({ item }) =>
        (["image", "video", "audio", "file"] as CloudItem["type"][]).includes(
          item.type,
        ) && item.status === allowedStatus,
    );
  let nextIndex = 0;

  const hydrateNext = async (): Promise<void> => {
    while (nextIndex < candidates.length) {
      const candidate = candidates[nextIndex++];
      if (signal?.aborted) return;
      try {
        const access = await getCachedCloudFileAccess(userId, candidate.item.id, {
          signal,
        });
        hydrated[candidate.index] = {
          ...candidate.item,
          accessUrl: access.url,
          accessExpiresAt: access.expiresAt,
          contentType: access.contentType,
        };
      } catch {
        hydrated[candidate.index] = candidate.item;
      }
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(ACCESS_REQUEST_CONCURRENCY, candidates.length) },
      () => hydrateNext(),
    ),
  );
  return hydrated;
};

export const useCloudWorkspace = (
  userId: string | undefined,
  searchQuery = "",
  itemType: CloudFilter = "all",
) => {
  const [state, setState] = useState<CloudWorkspaceState>(initialState);
  const mountedRef = useRef(true);
  const requestGenerationRef = useRef(0);
  const activePageControllerRef = useRef<AbortController | null>(null);
  const trashPageControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activePageControllerRef.current?.abort();
      trashPageControllerRef.current?.abort();
    };
  }, []);

  const loadInitial = useCallback(
    async (signal?: AbortSignal, background = false) => {
      const generation = ++requestGenerationRef.current;
      activePageControllerRef.current?.abort();
      trashPageControllerRef.current?.abort();
      if (!userId) {
        setState((current) => ({
          ...current,
          isLoading: false,
          isRefreshing: false,
          error: createMissingUserError(),
        }));
        return;
      }

      setState((current) => ({
        ...current,
        isLoading: background ? current.isLoading : true,
        isRefreshing: background,
        isLoadingMore: false,
        isLoadingMoreTrash: false,
        error: null,
      }));

      try {
        const query = searchQuery.trim() || undefined;
        const type = itemType === "all" ? undefined : itemType;
        const [page, trashPage, quota, quotaRequest, health] =
          await Promise.all([
            cloudApi.listItems(userId, { signal, q: query, type }),
            cloudApi.listTrash(userId, { signal, q: query, type }),
            cloudApi.getQuota(userId, signal),
            cloudApi
              .getCurrentQuotaRequest(userId, signal)
              .catch((error: unknown): CloudQuotaRequest | null => {
                if (error instanceof CloudApiError && error.status === 404)
                  return null;
                throw error;
              }),
            cloudApi.health(signal).catch((): CloudHealth => ({
              status: "DOWN",
              service: "hacom-cloud-api",
            })),
          ]);
        const hydratedItems = await hydrateMediaAccess(
          page.items,
          userId,
          signal,
        );
        const hydratedTrashItems = await hydrateMediaAccess(
          trashPage.items,
          userId,
          signal,
          "trashed",
        );
        if (
          !mountedRef.current ||
          signal?.aborted ||
          generation !== requestGenerationRef.current
        ) return;
        setState((current) => ({
          ...current,
          items: hydratedItems,
          trashItems: hydratedTrashItems,
          quota,
          quotaRequest,
          health,
          nextCursor: page.nextCursor,
          trashNextCursor: trashPage.nextCursor,
          isLoading: false,
          isRefreshing: false,
          isLoadingTrash: false,
          isLoadingMore: false,
          isLoadingMoreTrash: false,
          error: null,
        }));
      } catch (error) {
        if (
          signal?.aborted ||
          !mountedRef.current ||
          generation !== requestGenerationRef.current
        ) return;
        setState((current) => ({
          ...current,
          isLoading: false,
          isRefreshing: false,
          isLoadingTrash: false,
          error: asCloudError(error),
        }));
      }
    },
    [itemType, searchQuery, userId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadInitial(controller.signal);
    return () => controller.abort();
  }, [loadInitial]);

  const refresh = useCallback(async () => {
    await loadInitial(undefined, true);
  }, [loadInitial]);

  const loadMore = useCallback(async () => {
    if (!userId || !state.nextCursor || state.isLoadingMore) return;
    const generation = requestGenerationRef.current;
    const controller = new AbortController();
    activePageControllerRef.current?.abort();
    activePageControllerRef.current = controller;
    setState((current) => ({ ...current, isLoadingMore: true }));
    try {
      const page: CloudPage = await cloudApi.listItems(userId, {
        cursor: state.nextCursor,
        q: searchQuery.trim() || undefined,
        type: itemType === "all" ? undefined : itemType,
        signal: controller.signal,
      });
      const hydratedItems = await hydrateMediaAccess(
        page.items,
        userId,
        controller.signal,
      );
      if (
        !mountedRef.current ||
        controller.signal.aborted ||
        generation !== requestGenerationRef.current
      ) return;
      setState((current) => ({
        ...current,
        items: mergeItems(current.items, hydratedItems),
        nextCursor: page.nextCursor,
        isLoadingMore: false,
      }));
    } catch (error) {
      if (
        !mountedRef.current ||
        controller.signal.aborted ||
        generation !== requestGenerationRef.current
      ) return;
      setState((current) => ({
        ...current,
        isLoadingMore: false,
        error: asCloudError(error),
      }));
    }
  }, [itemType, searchQuery, state.isLoadingMore, state.nextCursor, userId]);

  const loadMoreTrash = useCallback(async () => {
    if (!userId || !state.trashNextCursor || state.isLoadingMoreTrash) return;
    const generation = requestGenerationRef.current;
    const controller = new AbortController();
    trashPageControllerRef.current?.abort();
    trashPageControllerRef.current = controller;
    setState((current) => ({ ...current, isLoadingMoreTrash: true }));
    try {
      const page = await cloudApi.listTrash(userId, {
        cursor: state.trashNextCursor,
        q: searchQuery.trim() || undefined,
        type: itemType === "all" ? undefined : itemType,
        signal: controller.signal,
      });
      const hydratedItems = await hydrateMediaAccess(
        page.items,
        userId,
        controller.signal,
        "trashed",
      );
      if (
        !mountedRef.current ||
        controller.signal.aborted ||
        generation !== requestGenerationRef.current
      ) return;
      setState((current) => ({
        ...current,
        trashItems: mergeTrashItems(current.trashItems, hydratedItems),
        trashNextCursor: page.nextCursor,
        isLoadingMoreTrash: false,
      }));
    } catch (error) {
      if (
        !mountedRef.current ||
        controller.signal.aborted ||
        generation !== requestGenerationRef.current
      ) return;
      setState((current) => ({
        ...current,
        isLoadingMoreTrash: false,
        error: asCloudError(error),
      }));
    }
  }, [itemType, searchQuery, state.isLoadingMoreTrash, state.trashNextCursor, userId]);

  const refreshQuota = useCallback(async () => {
    if (!userId) return;
    try {
      const quota = await cloudApi.getQuota(userId);
      if (mountedRef.current) {
        setState((current) => ({ ...current, quota }));
      }
    } catch (error) {
      if (mountedRef.current) {
        setState((current) => ({
          ...current,
          error: asCloudError(error),
        }));
      }
    }
  }, [userId]);

  const createText = useCallback(
    async (content: string) => {
      if (!userId) {
        const error = createMissingUserError();
        setState((current) => ({ ...current, error }));
        throw error;
      }
      setState((current) => ({ ...current, isMutating: true, error: null }));
      try {
        const item = await cloudApi.createText(userId, content);
        await refreshQuota();
        if (!mountedRef.current) return;
        setState((current) => ({
          ...current,
          items: mergeItems(current.items, [item]),
          isMutating: false,
        }));
      } catch (error) {
        if (!mountedRef.current) return;
        const cloudError = asCloudError(error);
        setState((current) => ({
          ...current,
          isMutating: false,
          error: cloudError,
        }));
        throw cloudError;
      }
    },
    [refreshQuota, userId],
  );

  const createLink = useCallback(
    async (url: string, title: string) => {
      if (!userId) {
        const error = createMissingUserError();
        setState((current) => ({ ...current, error }));
        throw error;
      }
      setState((current) => ({ ...current, isMutating: true, error: null }));
      try {
        const item = await cloudApi.createLink(userId, url, title);
        await refreshQuota();
        if (!mountedRef.current) return;
        setState((current) => ({
          ...current,
          items: mergeItems(current.items, [item]),
          isMutating: false,
        }));
      } catch (error) {
        if (!mountedRef.current) return;
        const cloudError = asCloudError(error);
        setState((current) => ({
          ...current,
          isMutating: false,
          error: cloudError,
        }));
        throw cloudError;
      }
    },
    [refreshQuota, userId],
  );

  const uploadFile = useCallback(
    async (file: File) => {
      if (!userId) {
        const error = createMissingUserError();
        setState((current) => ({ ...current, error }));
        throw error;
      }
      setState((current) => ({
        ...current,
        isMutating: true,
        error: null,
        uploadProgress: {
          fileName: file.name,
          percent: 0,
          stage: "reserving",
        },
      }));
      try {
        const session = await cloudApi.initiateUpload(userId, file);
        if (mountedRef.current) {
          setState((current) => ({
            ...current,
            uploadProgress: {
              fileName: file.name,
              percent: 2,
              stage: "uploading",
            },
          }));
        }
        await cloudApi.uploadObject(session, file, (percent) => {
          if (!mountedRef.current) return;
          setState((current) => ({
            ...current,
            uploadProgress: {
              fileName: file.name,
              percent,
              stage: "uploading",
            },
          }));
        });
        if (mountedRef.current) {
          setState((current) => ({
            ...current,
            uploadProgress: {
              fileName: file.name,
              percent: 100,
              stage: "finalizing",
            },
          }));
        }
        const completed = await cloudApi.completeUpload(
          userId,
          session.uploadSessionId,
        );
        await refreshQuota();
        if (!mountedRef.current) return;
        setState((current) => ({
          ...current,
          items: mergeItems(current.items, [completed.item]),
          isMutating: false,
          uploadProgress: {
            fileName: file.name,
            percent: 100,
            stage: "processing",
          },
        }));
      } catch (error) {
        if (!mountedRef.current) return;
        const cloudError = asCloudError(error);
        setState((current) => ({
          ...current,
          isMutating: false,
          uploadProgress: null,
          error: cloudError,
        }));
        throw cloudError;
      }
    },
    [refreshQuota, userId],
  );

  const trashItem = useCallback(
    async (itemId: string) => {
      if (!userId) throw createMissingUserError();
      setState((current) => ({ ...current, isMutating: true, error: null }));
      try {
        await cloudApi.trashItem(userId, itemId);
        invalidateCloudFileAccess(userId, itemId);
        await loadInitial(undefined, true);
        if (!mountedRef.current) return;
        setState((current) => ({
          ...current,
          isMutating: false,
        }));
      } catch (error) {
        if (!mountedRef.current) return;
        const cloudError = asCloudError(error);
        setState((current) => ({
          ...current,
          isMutating: false,
          error: cloudError,
        }));
        throw cloudError;
      }
    },
    [loadInitial, userId],
  );

  const restoreItem = useCallback(
    async (itemId: string) => {
      if (!userId) throw createMissingUserError();
      setState((current) => ({ ...current, isMutating: true, error: null }));
      try {
        await cloudApi.restoreItem(userId, itemId);
        invalidateCloudFileAccess(userId, itemId);
        await loadInitial(undefined, true);
        if (!mountedRef.current) return;
        setState((current) => ({
          ...current,
          isMutating: false,
        }));
      } catch (error) {
        if (!mountedRef.current) return;
        const cloudError = asCloudError(error);
        setState((current) => ({
          ...current,
          isMutating: false,
          error: cloudError,
        }));
        throw cloudError;
      }
    },
    [loadInitial, userId],
  );

  const permanentlyDeleteItem = useCallback(
    async (itemId: string) => {
      if (!userId) throw createMissingUserError();
      setState((current) => ({ ...current, isMutating: true, error: null }));
      try {
        await cloudApi.permanentlyDeleteItem(userId, itemId);
        invalidateCloudFileAccess(userId, itemId);
        await loadInitial(undefined, true);
        if (!mountedRef.current) return;
        setState((current) => ({
          ...current,
          isMutating: false,
        }));
      } catch (error) {
        if (!mountedRef.current) return;
        const cloudError = asCloudError(error);
        setState((current) => ({
          ...current,
          isMutating: false,
          error: cloudError,
        }));
        throw cloudError;
      }
    },
    [loadInitial, userId],
  );

  const requestQuota = useCallback(
    async (requestedQuotaBytes: number, reason?: string) => {
      if (!userId) throw createMissingUserError();
      setState((current) => ({
        ...current,
        isRequestingQuota: true,
        error: null,
      }));
      try {
        const quotaRequest = await cloudApi.requestQuota(
          userId,
          requestedQuotaBytes,
          reason,
        );
        if (!mountedRef.current) return;
        setState((current) => ({
          ...current,
          quotaRequest,
          isRequestingQuota: false,
        }));
      } catch (error) {
        if (!mountedRef.current) return;
        const cloudError = asCloudError(error);
        setState((current) => ({
          ...current,
          isRequestingQuota: false,
          error: cloudError,
        }));
        throw cloudError;
      }
    },
    [userId],
  );

  const emptyTrash = useCallback(async () => {
    if (!userId) throw createMissingUserError();
    setState((current) => ({ ...current, isMutating: true, error: null }));
    try {
      const allItems: CloudItem[] = [];
      const seenCursors = new Set<string>();
      let cursor: string | undefined;
      do {
        if (cursor && seenCursors.has(cursor)) {
          throw new CloudApiError({
            status: 0,
            code: "CLOUD_PAGINATION_LOOP",
            message: "Trash pagination returned a repeated cursor",
          });
        }
        if (cursor) seenCursors.add(cursor);
        const page = await cloudApi.listTrash(userId, { cursor, limit: 100 });
        allItems.push(...page.items);
        cursor = page.nextCursor;
      } while (cursor);

      for (const item of allItems) {
        await cloudApi.permanentlyDeleteItem(userId, item.id);
        invalidateCloudFileAccess(userId, item.id);
      }
      await loadInitial(undefined, true);
      if (mountedRef.current) {
        setState((current) => ({ ...current, isMutating: false }));
      }
    } catch (error) {
      const cloudError = asCloudError(error);
      if (mountedRef.current) {
        setState((current) => ({
          ...current,
          isMutating: false,
          error: cloudError,
        }));
      }
      throw cloudError;
    }
  }, [loadInitial, userId]);

  const hasProcessingItems = useMemo(
    () => state.items.some((item) => item.status === "processing"),
    [state.items],
  );

  useEffect(() => {
    if (!userId || !hasProcessingItems) {
      if (state.uploadProgress?.stage === "processing") {
        setState((current) => ({ ...current, uploadProgress: null }));
      }
      return undefined;
    }

    let cancelled = false;
    const refreshProcessingItems = async () => {
      try {
        const page = await cloudApi.listItems(userId, {
          q: searchQuery.trim() || undefined,
          type: itemType === "all" ? undefined : itemType,
        });
        const hydratedItems = await hydrateMediaAccess(page.items, userId);
        if (cancelled || !mountedRef.current) return;
        const stillProcessing = hydratedItems.some(
          (item) => item.status === "processing",
        );
        setState((current) => ({
          ...current,
          items: mergeItems(current.items, hydratedItems),
          nextCursor:
            current.items.length > page.items.length
              ? current.nextCursor
              : page.nextCursor,
          uploadProgress: stillProcessing ? current.uploadProgress : null,
          error:
            current.error?.code === "CLOUD_PROCESSING_REFRESH_FAILED"
              ? null
              : current.error,
        }));
      } catch (error) {
        if (!cancelled && mountedRef.current) {
          const cloudError = asCloudError(error);
          setState((current) => ({
            ...current,
            error: new CloudApiError({
              status: cloudError.status,
              code: "CLOUD_PROCESSING_REFRESH_FAILED",
              message: cloudError.message,
              requestId: cloudError.requestId,
            }),
          }));
        }
      }
    };

    const intervalId = window.setInterval(
      () => void refreshProcessingItems(),
      PROCESSING_REFRESH_MS,
    );
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [hasProcessingItems, itemType, searchQuery, state.uploadProgress?.stage, userId]);

  const clearError = useCallback(() => {
    setState((current) => ({ ...current, error: null }));
  }, []);

  return {
    ...state,
    refresh,
    loadMore,
    loadMoreTrash,
    createText,
    createLink,
    uploadFile,
    trashItem,
    restoreItem,
    permanentlyDeleteItem,
    emptyTrash,
    requestQuota,
    clearError,
  };
};
