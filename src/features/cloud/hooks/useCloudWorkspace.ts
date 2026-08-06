import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cloudApi, CloudApiError } from "../api/cloudApi";
import type {
  CloudHealth,
  CloudItem,
  CloudPage,
  CloudQuota,
  CloudQuotaRequest,
  CloudUploadProgress,
} from "../types";
import { getCachedCloudFileAccess } from "../utils/cloudFileAccessCache";

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
): Promise<CloudItem[]> => {
  const hydrated = [...items];
  const candidates = items
    .map((item, index) => ({ item, index }))
    .filter(
      ({ item }) =>
        (["image", "video", "audio", "file"] as CloudItem["type"][]).includes(
          item.type,
        ) && item.status === "ready",
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
) => {
  const [state, setState] = useState<CloudWorkspaceState>(initialState);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadInitial = useCallback(
    async (signal?: AbortSignal, background = false) => {
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
        error: null,
      }));

      try {
        const query = searchQuery.trim() || undefined;
        const [page, trashPage, quota, quotaRequest, health] =
          await Promise.all([
            cloudApi.listItems(userId, { signal, q: query }),
            cloudApi.listTrash(userId, { signal, q: query }),
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
        if (!mountedRef.current || signal?.aborted) return;
        setState((current) => ({
          ...current,
          items: hydratedItems,
          trashItems: trashPage.items,
          quota,
          quotaRequest,
          health,
          nextCursor: page.nextCursor,
          trashNextCursor: trashPage.nextCursor,
          isLoading: false,
          isRefreshing: false,
          isLoadingTrash: false,
          error: null,
        }));
      } catch (error) {
        if (signal?.aborted || !mountedRef.current) return;
        setState((current) => ({
          ...current,
          isLoading: false,
          isRefreshing: false,
          isLoadingTrash: false,
          error: asCloudError(error),
        }));
      }
    },
    [searchQuery, userId],
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
    setState((current) => ({ ...current, isLoadingMore: true }));
    try {
      const page: CloudPage = await cloudApi.listItems(userId, {
        cursor: state.nextCursor,
        q: searchQuery.trim() || undefined,
      });
      const hydratedItems = await hydrateMediaAccess(page.items, userId);
      if (!mountedRef.current) return;
      setState((current) => ({
        ...current,
        items: mergeItems(current.items, hydratedItems),
        nextCursor: page.nextCursor,
        isLoadingMore: false,
      }));
    } catch (error) {
      if (!mountedRef.current) return;
      setState((current) => ({
        ...current,
        isLoadingMore: false,
        error: asCloudError(error),
      }));
    }
  }, [searchQuery, state.isLoadingMore, state.nextCursor, userId]);

  const loadMoreTrash = useCallback(async () => {
    if (!userId || !state.trashNextCursor || state.isLoadingMoreTrash) return;
    setState((current) => ({ ...current, isLoadingMoreTrash: true }));
    try {
      const page = await cloudApi.listTrash(userId, {
        cursor: state.trashNextCursor,
        q: searchQuery.trim() || undefined,
      });
      if (!mountedRef.current) return;
      setState((current) => ({
        ...current,
        trashItems: mergeTrashItems(current.trashItems, page.items),
        trashNextCursor: page.nextCursor,
        isLoadingMoreTrash: false,
      }));
    } catch (error) {
      if (!mountedRef.current) return;
      setState((current) => ({
        ...current,
        isLoadingMoreTrash: false,
        error: asCloudError(error),
      }));
    }
  }, [searchQuery, state.isLoadingMoreTrash, state.trashNextCursor, userId]);

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
  }, [hasProcessingItems, searchQuery, state.uploadProgress?.stage, userId]);

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
    requestQuota,
    clearError,
  };
};
