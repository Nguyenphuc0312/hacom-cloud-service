import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cloudApi, CloudApiError } from "../api/cloudApi";
import type {
  CloudHealth,
  CloudItem,
  CloudItemSummary,
  CloudPage,
  CloudQuota,
  CloudQuotaRequest,
  CloudUploadProgress,
} from "../types";
import { getCachedCloudFileAccess } from "../utils/cloudFileAccessCache";
import { normalizeCloudItemType } from "../utils/cloudFormat";

const PROCESSING_REFRESH_MS = 2_000;
const INITIAL_LOAD_RETRY_DELAYS_MS = [150, 400];

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
  /** True after at least one complete active-list request has succeeded. */
  hasLoadedSuccessfully: boolean;
  /** The visible items belong to the previous request while this is true. */
  isDataStale: boolean;
  error: CloudApiError | null;
  nextCursor?: string;
  trashNextCursor?: string;
  uploadProgress: CloudUploadProgress | null;
  summary: CloudItemSummary | null;
}

export interface CloudWorkspaceOptions {
  query?: string;
  type?: CloudItem["type"];
  from?: string;
  to?: string;
  minSizeBytes?: number;
  maxSizeBytes?: number;
  sort?: "created_at" | "title" | "size_bytes";
  order?: "asc" | "desc";
  limit?: number;
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
  hasLoadedSuccessfully: false,
  isDataStale: false,
  error: null,
  uploadProgress: null,
  summary: null,
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
  sort: CloudWorkspaceOptions["sort"] = "created_at",
  order: CloudWorkspaceOptions["order"] = "desc",
): CloudItem[] => {
  const byId = new Map(current.map((item) => [item.id, item]));
  incoming.forEach((item) => byId.set(item.id, item));
  const title = (item: CloudItem) => (item.title || item.content || item.url || "").trim().toLocaleLowerCase();
  const direction = order === "asc" ? 1 : -1;
  return Array.from(byId.values()).sort((left, right) => {
    let delta = 0;
    if (sort === "title") delta = title(left).localeCompare(title(right), "vi");
    else if (sort === "size_bytes") delta = left.sizeBytes - right.sizeBytes;
    else delta = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    return delta * direction || left.id.localeCompare(right.id) * direction;
  });
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
  const normalizedItems = items.map(normalizeCloudItemType);
  const hydrated = [...normalizedItems];
  const candidates = normalizedItems
    .map((item, index) => ({ item, index }))
    .filter(
      ({ item }) =>
        (["image", "video", "audio", "file"] as CloudItem["type"][]).includes(
          item.type,
        ) && (item.status === "ready" || item.status === "trashed"),
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

const waitForRetry = (delayMs: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("The request was aborted", "AbortError"));
      return;
    }
    const timer = window.setTimeout(resolve, delayMs);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new DOMException("The request was aborted", "AbortError"));
      },
      { once: true },
    );
  });

const isOptionalEndpointMissing = (error: unknown): boolean =>
  error instanceof CloudApiError &&
  [404, 405, 501].includes(error.status);

const emptyCloudPage = (): CloudPage => ({ items: [], nextCursor: undefined });

export const useCloudWorkspace = (
  userId: string | undefined,
  searchQueryOrOptions: string | CloudWorkspaceOptions = "",
) => {
  const workspaceOptions = typeof searchQueryOrOptions === "string"
    ? { query: searchQueryOrOptions }
    : searchQueryOrOptions;
  const searchQuery = workspaceOptions.query?.trim() ?? "";
  const apiQuery = searchQuery.length >= 3 ? searchQuery : undefined;
  const listOptions = {
    type: workspaceOptions.type,
    from: workspaceOptions.from,
    to: workspaceOptions.to,
    minSizeBytes: workspaceOptions.minSizeBytes,
    maxSizeBytes: workspaceOptions.maxSizeBytes,
    sort: workspaceOptions.sort,
    order: workspaceOptions.order,
    limit: workspaceOptions.limit,
  } as const;
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
        isDataStale: current.hasLoadedSuccessfully,
        error: null,
      }));

      try {
        let bundle: [
          CloudPage,
          CloudPage,
          CloudQuota | null,
          CloudQuotaRequest | null,
          CloudHealth,
          CloudItemSummary | null,
        ] | undefined;
        let lastError: unknown;
        for (let attempt = 0; attempt <= INITIAL_LOAD_RETRY_DELAYS_MS.length; attempt += 1) {
          try {
          bundle = await Promise.all([
              cloudApi.listItems(userId, { ...listOptions, signal, q: apiQuery }),
              // Trash/quota were introduced after the first Cloud rollout.
              // A gateway serving an older contract must not blank the active
              // My Documents timeline; treat only missing-method responses as
              // optional while still surfacing auth/network failures.
              cloudApi
                .listTrash(userId, { signal, q: apiQuery })
                .catch((error: unknown): CloudPage => {
                  if (isOptionalEndpointMissing(error)) return emptyCloudPage();
                  throw error;
                }),
              cloudApi.getQuota(userId, signal).catch((error: unknown) => {
                if (isOptionalEndpointMissing(error)) return null;
                throw error;
              }),
              cloudApi
                .getCurrentQuotaRequest(userId, signal)
                .catch((error: unknown): CloudQuotaRequest | null => {
                  if (isOptionalEndpointMissing(error)) return null;
                  throw error;
                }),
              cloudApi.health(signal).catch((): CloudHealth => ({
                status: "DOWN",
                service: "hacom-cloud-api",
              })),
              // Summary is an enhancement for the management cards. A Cloud
              // deployment that predates the endpoint (or is temporarily
              // unavailable) must not prevent the timeline itself from loading.
              cloudApi.getItemSummary(userId, signal).catch((): CloudItemSummary | null => null),
          ]);
            break;
          } catch (error) {
            lastError = error;
            if (signal?.aborted || attempt >= INITIAL_LOAD_RETRY_DELAYS_MS.length) {
              throw error;
            }
            await waitForRetry(INITIAL_LOAD_RETRY_DELAYS_MS[attempt], signal);
          }
        }
        if (!bundle) throw lastError ?? new Error("Cloud data unavailable");
        const [page, trashPage, quota, quotaRequest, health, summary] = bundle;
        const hydratedItems = await hydrateMediaAccess(
          page.items,
          userId,
          signal,
        );
        const hydratedTrashItems = await hydrateMediaAccess(
          trashPage.items,
          userId,
          signal,
        );
        if (!mountedRef.current || signal?.aborted) return;
        setState((current) => ({
          ...current,
          items: hydratedItems,
          trashItems: hydratedTrashItems,
          quota,
          quotaRequest,
          health,
          summary,
          nextCursor: page.nextCursor,
          trashNextCursor: trashPage.nextCursor,
          isLoading: false,
          isRefreshing: false,
          isLoadingTrash: false,
          hasLoadedSuccessfully: true,
          isDataStale: false,
          error: null,
        }));
      } catch (error) {
        if (signal?.aborted || !mountedRef.current) return;
        setState((current) => ({
          ...current,
          isLoading: false,
          isRefreshing: false,
          isLoadingTrash: false,
          isDataStale: current.hasLoadedSuccessfully,
          error: asCloudError(error),
        }));
      }
    },
    [apiQuery, listOptions.from, listOptions.limit, listOptions.maxSizeBytes, listOptions.minSizeBytes, listOptions.order, listOptions.sort, listOptions.to, listOptions.type, searchQuery, userId],
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
        ...listOptions,
        cursor: state.nextCursor,
        q: apiQuery,
      });
      const hydratedItems = await hydrateMediaAccess(page.items, userId);
      if (!mountedRef.current) return;
      setState((current) => ({
        ...current,
        items: mergeItems(current.items, hydratedItems, listOptions.sort, listOptions.order),
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
  }, [apiQuery, listOptions.from, listOptions.limit, listOptions.maxSizeBytes, listOptions.minSizeBytes, listOptions.order, listOptions.sort, listOptions.to, listOptions.type, state.isLoadingMore, state.nextCursor, userId]);

  const loadMoreTrash = useCallback(async () => {
    if (!userId || !state.trashNextCursor || state.isLoadingMoreTrash) return;
    setState((current) => ({ ...current, isLoadingMoreTrash: true }));
    try {
      const page = await cloudApi.listTrash(userId, {
        cursor: state.trashNextCursor,
        q: apiQuery,
      });
      const hydratedItems = await hydrateMediaAccess(page.items, userId);
      if (!mountedRef.current) return;
      setState((current) => ({
        ...current,
        trashItems: mergeTrashItems(current.trashItems, hydratedItems),
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
  }, [apiQuery, state.isLoadingMoreTrash, state.trashNextCursor, userId]);

  /** Load every remaining trash page for the gallery view. */
  const loadAllTrash = useCallback(async () => {
    if (!userId || !state.trashNextCursor || state.isLoadingMoreTrash) return;
    setState((current) => ({ ...current, isLoadingMoreTrash: true }));
    try {
      let cursor: string | undefined = state.trashNextCursor;
      let incoming: CloudItem[] = [];
      while (cursor) {
        const page = await cloudApi.listTrash(userId, {
          cursor,
          q: apiQuery,
        });
        const hydratedItems = await hydrateMediaAccess(page.items, userId);
        incoming = mergeTrashItems(incoming, hydratedItems);
        cursor = page.nextCursor;
      }
      if (!mountedRef.current) return;
      setState((current) => ({
        ...current,
        trashItems: mergeTrashItems(current.trashItems, incoming),
        trashNextCursor: undefined,
        isLoadingMoreTrash: false,
      }));
    } catch (error) {
      if (!mountedRef.current) return;
      setState((current) => ({
        ...current,
        isLoadingMoreTrash: false,
        error: asCloudError(error),
      }));
      throw error;
    }
  }, [apiQuery, state.isLoadingMoreTrash, state.trashNextCursor, userId]);

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
          items: mergeItems(current.items, [item], listOptions.sort, listOptions.order),
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
    [listOptions.order, listOptions.sort, refreshQuota, userId],
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
          items: mergeItems(current.items, [item], listOptions.sort, listOptions.order),
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
    [listOptions.order, listOptions.sort, refreshQuota, userId],
  );

  const uploadFile = useCallback(
    async (file: File): Promise<CloudItem> => {
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
        if (mountedRef.current) {
          setState((current) => ({
            ...current,
            items: mergeItems(current.items, [normalizeCloudItemType(completed.item)], listOptions.sort, listOptions.order),
            isMutating: false,
            uploadProgress: {
              fileName: file.name,
              percent: 100,
              stage: "processing",
            },
          }));
        }
        return normalizeCloudItemType(completed.item);
      } catch (error) {
        const cloudError = asCloudError(error);
        if (mountedRef.current) {
          setState((current) => ({
            ...current,
            isMutating: false,
            uploadProgress: null,
            error: cloudError,
          }));
        }
        throw cloudError;
      }
    },
    [listOptions.order, listOptions.sort, refreshQuota, userId],
  );

  const trashItem = useCallback(
    async (itemId: string) => {
      if (!userId) throw createMissingUserError();
      setState((current) => ({ ...current, isMutating: true, error: null }));
      try {
        await cloudApi.trashItem(userId, itemId);
        // Move the item locally as soon as the server accepts the transition.
        // This keeps the Trash count and list correct even when the read model
        // is eventually consistent immediately after POST /trash.
        const movedAt = new Date().toISOString();
        let locallyMoved: CloudItem | undefined;
        setState((current) => {
          const item = current.items.find((candidate) => candidate.id === itemId);
          if (!item) return { ...current, isMutating: false };
          const trashedItem: CloudItem = {
            ...item,
            status: "trashed",
            deletedAt: item.deletedAt ?? movedAt,
            purgeAfter: item.purgeAfter ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          };
          locallyMoved = trashedItem;
          return {
            ...current,
            items: current.items.filter((candidate) => candidate.id !== itemId),
            trashItems: mergeTrashItems(current.trashItems, [trashedItem]),
            isMutating: false,
          };
        });
        await loadInitial(undefined, true);
        // A read immediately after the mutation can still return the old
        // active projection. Re-apply the accepted transition after refresh
        // so links/files cannot disappear from Trash during that window.
        if (locallyMoved && mountedRef.current) {
          setState((current) => ({
            ...current,
            items: current.items.filter((candidate) => candidate.id !== itemId),
            trashItems: mergeTrashItems(
              current.trashItems.filter((candidate) => candidate.id !== itemId),
              [current.trashItems.find((candidate) => candidate.id === itemId) ?? locallyMoved!],
            ),
            isMutating: false,
          }));
        }
        if (!mountedRef.current) return;
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
        let locallyRestored: CloudItem | undefined;
        setState((current) => {
          const item = current.trashItems.find((candidate) => candidate.id === itemId);
          if (!item) return { ...current, isMutating: false };
          const restoredItem: CloudItem = {
            ...item,
            status: "ready",
            deletedAt: undefined,
            purgeAfter: undefined,
          };
          locallyRestored = restoredItem;
          return {
            ...current,
            trashItems: current.trashItems.filter((candidate) => candidate.id !== itemId),
            items: mergeItems(current.items, [restoredItem], listOptions.sort, listOptions.order),
            isMutating: false,
          };
        });
        await loadInitial(undefined, true);
        if (locallyRestored && mountedRef.current) {
          setState((current) => ({
            ...current,
            trashItems: current.trashItems.filter((candidate) => candidate.id !== itemId),
            items: mergeItems(
              current.items.filter((candidate) => candidate.id !== itemId),
              [current.items.find((candidate) => candidate.id === itemId) ?? locallyRestored!],
              listOptions.sort,
              listOptions.order,
            ),
            isMutating: false,
          }));
        }
        if (!mountedRef.current) return;
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
    [listOptions.order, listOptions.sort, loadInitial, userId],
  );

  const permanentlyDeleteItem = useCallback(
    async (itemId: string) => {
      if (!userId) throw createMissingUserError();
      setState((current) => ({ ...current, isMutating: true, error: null }));
      try {
        await cloudApi.permanentlyDeleteItem(userId, itemId);
        setState((current) => ({
          ...current,
          trashItems: current.trashItems.filter((candidate) => candidate.id !== itemId),
          isMutating: false,
        }));
        await loadInitial(undefined, true);
        if (mountedRef.current) {
          setState((current) => ({
            ...current,
            trashItems: current.trashItems.filter((candidate) => candidate.id !== itemId),
            isMutating: false,
          }));
        }
        if (!mountedRef.current) return;
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
          ...listOptions,
          q: apiQuery,
        });
        const hydratedItems = await hydrateMediaAccess(page.items, userId);
        if (cancelled || !mountedRef.current) return;
        const stillProcessing = hydratedItems.some(
          (item) => item.status === "processing",
        );
        setState((current) => ({
          ...current,
          items: mergeItems(current.items, hydratedItems, listOptions.sort, listOptions.order),
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
  }, [apiQuery, hasProcessingItems, listOptions.from, listOptions.limit, listOptions.maxSizeBytes, listOptions.minSizeBytes, listOptions.order, listOptions.sort, listOptions.to, listOptions.type, state.uploadProgress?.stage, userId]);

  const clearError = useCallback(() => {
    setState((current) => ({ ...current, error: null }));
  }, []);

  return {
    ...state,
    refresh,
    loadMore,
    loadMoreTrash,
    loadAllTrash,
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
