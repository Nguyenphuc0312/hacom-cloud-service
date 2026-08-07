import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cloudApi, CloudApiError } from "../api/cloudApi";
import type {
  CloudHealth,
  CloudItem,
  CloudPage,
  CloudQuota,
  CloudQuotaRequest,
  CloudFilter,
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
  trashUnavailable: boolean;
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
  trashUnavailable: false,
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

const isMissingTrashRoute = (error: unknown): error is CloudApiError =>
  error instanceof CloudApiError &&
  error.status === 404 &&
  error.code === "ROUTE_NOT_FOUND";

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

const canResolveCloudAccess = (item: CloudItem): boolean =>
  item.status === "ready" || item.status === "trashed";

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
        ) && canResolveCloudAccess(item),
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
  filter: CloudFilter = "all",
) => {
  const [state, setState] = useState<CloudWorkspaceState>(initialState);
  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const queryKeyRef = useRef("");
  const activeRequestRef = useRef<AbortController | null>(null);
  const operationKeysRef = useRef(new Map<string, string>());

  const query = searchQuery.trim() || undefined;
  const itemType = filter === "all" ? undefined : filter;
  const queryKey = `${userId ?? ""}|${query ?? ""}|${filter}`;
  queryKeyRef.current = queryKey;

  const getOperationKey = useCallback((operation: string, identity: string) => {
    const key = `${operation}:${identity}`;
    const existing = operationKeysRef.current.get(key);
    if (existing) return existing;
    const next = `cloud-web-${crypto.randomUUID()}`;
    operationKeysRef.current.set(key, next);
    return next;
  }, []);

  const completeOperation = useCallback((operation: string, identity: string) => {
    operationKeysRef.current.delete(`${operation}:${identity}`);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadInitial = useCallback(
    async (signal?: AbortSignal, background = false) => {
      const generation = ++generationRef.current;
      if (activeRequestRef.current && !signal) {
        activeRequestRef.current.abort();
      }
      const ownedController = signal ? null : new AbortController();
      const requestSignal = signal ?? ownedController?.signal;
      if (ownedController) activeRequestRef.current = ownedController;
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
        ...(background
          ? {}
          : {
              items: [],
              trashItems: [],
              nextCursor: undefined,
              trashNextCursor: undefined,
            }),
        isLoading: background ? current.isLoading : true,
        isRefreshing: background,
        isLoadingMore: false,
        isLoadingMoreTrash: false,
        trashUnavailable: false,
        error: null,
      }));

      try {
        const trashPageResult: Promise<{
          page: CloudPage;
          unavailable: boolean;
        }> = cloudApi
          .listTrash(userId, {
            signal: requestSignal,
            q: query,
            type: itemType,
          })
          .then((page) => ({ page, unavailable: false }))
          .catch((error: unknown) => {
            if (isMissingTrashRoute(error)) {
              return { page: { items: [] }, unavailable: true };
            }
            throw error;
          });
        const [page, trashResult, quota, quotaRequest, health] =
          await Promise.all([
            cloudApi.listItems(userId, { signal: requestSignal, q: query, type: itemType }),
            trashPageResult,
            cloudApi.getQuota(userId, requestSignal),
            cloudApi
              .getCurrentQuotaRequest(userId, requestSignal)
              .catch((error: unknown): CloudQuotaRequest | null => {
                if (error instanceof CloudApiError && error.status === 404)
                  return null;
                throw error;
              }),
            cloudApi.health(requestSignal).catch((): CloudHealth => ({
              status: "DOWN",
              service: "hacom-cloud-api",
            })),
          ]);
        const hydratedItems = await hydrateMediaAccess(
          page.items,
          userId,
          requestSignal,
        );
        const hydratedTrashItems = await hydrateMediaAccess(
          trashResult.page.items,
          userId,
          requestSignal,
        );
        if (
          !mountedRef.current ||
          requestSignal?.aborted ||
          generation !== generationRef.current ||
          queryKey !== queryKeyRef.current
        ) return;
        setState((current) => ({
          ...current,
          items: hydratedItems,
          trashItems: hydratedTrashItems,
          trashUnavailable: trashResult.unavailable,
          quota,
          quotaRequest,
          health,
          nextCursor: page.nextCursor,
          trashNextCursor: trashResult.page.nextCursor,
          isLoading: false,
          isRefreshing: false,
          isLoadingTrash: false,
          error: null,
        }));
      } catch (error) {
        if (
          requestSignal?.aborted ||
          !mountedRef.current ||
          generation !== generationRef.current
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
    [itemType, query, queryKey, userId],
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
    const generation = generationRef.current;
    const requestKey = queryKeyRef.current;
    const controller = new AbortController();
    setState((current) => ({ ...current, isLoadingMore: true }));
    try {
      const page: CloudPage = await cloudApi.listItems(userId, {
        cursor: state.nextCursor,
        q: query,
        type: itemType,
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
        generation !== generationRef.current ||
        requestKey !== queryKeyRef.current
      ) return;
      setState((current) => ({
        ...current,
        items: mergeItems(current.items, hydratedItems),
        nextCursor: page.nextCursor,
        isLoadingMore: false,
      }));
    } catch (error) {
      if (!mountedRef.current || controller.signal.aborted) return;
      setState((current) => ({
        ...current,
        isLoadingMore: false,
        error: asCloudError(error),
      }));
    }
  }, [itemType, query, state.isLoadingMore, state.nextCursor, userId]);

  const loadMoreTrash = useCallback(async () => {
    if (
      !userId ||
      state.trashUnavailable ||
      !state.trashNextCursor ||
      state.isLoadingMoreTrash
    )
      return;
    const generation = generationRef.current;
    const requestKey = queryKeyRef.current;
    const controller = new AbortController();
    setState((current) => ({ ...current, isLoadingMoreTrash: true }));
    try {
      const page = await cloudApi.listTrash(userId, {
        cursor: state.trashNextCursor,
        q: query,
        type: itemType,
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
        generation !== generationRef.current ||
        requestKey !== queryKeyRef.current
      ) return;
      setState((current) => ({
        ...current,
        trashItems: mergeTrashItems(current.trashItems, hydratedItems),
        trashNextCursor: page.nextCursor,
        isLoadingMoreTrash: false,
      }));
    } catch (error) {
      if (!mountedRef.current || controller.signal.aborted) return;
      setState((current) => ({
        ...current,
        isLoadingMoreTrash: false,
        error: asCloudError(error),
      }));
    }
  }, [
    itemType,
    query,
    state.isLoadingMoreTrash,
    state.trashNextCursor,
    state.trashUnavailable,
    userId,
  ]);

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
      const operationIdentity = crypto.randomUUID();
      const idempotencyKey = getOperationKey("create-text", operationIdentity);
      try {
        const item = await cloudApi.createText(userId, content, {
          idempotencyKey,
        });
        completeOperation("create-text", operationIdentity);
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
    [completeOperation, getOperationKey, refreshQuota, userId],
  );

  const createLink = useCallback(
    async (url: string, title: string) => {
      if (!userId) {
        const error = createMissingUserError();
        setState((current) => ({ ...current, error }));
        throw error;
      }
      setState((current) => ({ ...current, isMutating: true, error: null }));
      const operationIdentity = crypto.randomUUID();
      const idempotencyKey = getOperationKey("create-link", operationIdentity);
      try {
        const item = await cloudApi.createLink(userId, url, title, {
          idempotencyKey,
        });
        completeOperation("create-link", operationIdentity);
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
    [completeOperation, getOperationKey, refreshQuota, userId],
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
      const operationIdentity = `${file.name}:${file.size}:${file.lastModified}`;
      const initiateKey = getOperationKey("upload-initiate", operationIdentity);
      try {
        const session = await cloudApi.initiateUpload(userId, file, {
          idempotencyKey: initiateKey,
        });
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
          {
            idempotencyKey: getOperationKey(
              "upload-complete",
              session.uploadSessionId,
            ),
          },
        );
        completeOperation("upload-initiate", operationIdentity);
        completeOperation("upload-complete", session.uploadSessionId);
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
    [completeOperation, getOperationKey, refreshQuota, userId],
  );

  const trashItem = useCallback(
    async (itemId: string) => {
      if (!userId) throw createMissingUserError();
      setState((current) => ({ ...current, isMutating: true, error: null }));
      const operationIdentity = itemId;
      try {
        await cloudApi.trashItem(userId, itemId, {
          idempotencyKey: getOperationKey("trash", operationIdentity),
        });
        invalidateCloudFileAccess(userId, itemId);
        completeOperation("trash", operationIdentity);
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
    [completeOperation, getOperationKey, loadInitial, userId],
  );

  const restoreItem = useCallback(
    async (itemId: string) => {
      if (!userId) throw createMissingUserError();
      setState((current) => ({ ...current, isMutating: true, error: null }));
      const operationIdentity = itemId;
      try {
        await cloudApi.restoreItem(userId, itemId, {
          idempotencyKey: getOperationKey("restore", operationIdentity),
        });
        invalidateCloudFileAccess(userId, itemId);
        completeOperation("restore", operationIdentity);
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
    [completeOperation, getOperationKey, loadInitial, userId],
  );

  const permanentlyDeleteItem = useCallback(
    async (itemId: string) => {
      if (!userId) throw createMissingUserError();
      setState((current) => ({ ...current, isMutating: true, error: null }));
      const operationIdentity = itemId;
      try {
        await cloudApi.permanentlyDeleteItem(userId, itemId, {
          idempotencyKey: getOperationKey("delete", operationIdentity),
        });
        invalidateCloudFileAccess(userId, itemId);
        completeOperation("delete", operationIdentity);
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
    [completeOperation, getOperationKey, loadInitial, userId],
  );

  const emptyTrash = useCallback(async () => {
    if (!userId) throw createMissingUserError();
    setState((current) => ({ ...current, isMutating: true, error: null }));
    const deletedIds = new Set<string>();
    try {
      // The API currently exposes item-level permanent delete only. Re-read the
      // first page after each batch so deleting a page cannot invalidate the
      // cursor and leave older Trash items behind.
      let emptied = false;
      for (let round = 0; round < 100; round += 1) {
        const page = await cloudApi.listTrash(userId, { limit: 100 });
        if (page.items.length === 0) {
          emptied = true;
          break;
        }
        for (const item of page.items) {
          deletedIds.add(item.id);
          await cloudApi.permanentlyDeleteItem(userId, item.id, {
            idempotencyKey: getOperationKey("empty-trash-delete", item.id),
          });
          invalidateCloudFileAccess(userId, item.id);
        }
      }
      if (!emptied) {
        throw new CloudApiError({
          status: 409,
          code: "EMPTY_TRASH_INCOMPLETE",
          message: "Trash could not be emptied before the retry limit",
        });
      }
      deletedIds.forEach((itemId) =>
        completeOperation("empty-trash-delete", itemId),
      );
      await loadInitial(undefined, true);
      if (!mountedRef.current) return;
      setState((current) => ({ ...current, isMutating: false }));
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
  }, [completeOperation, getOperationKey, loadInitial, userId]);

  const requestQuota = useCallback(
    async (requestedQuotaBytes: number, reason?: string) => {
      if (!userId) throw createMissingUserError();
      setState((current) => ({
        ...current,
        isRequestingQuota: true,
        error: null,
      }));
      const operationIdentity = "current";
      try {
        const quotaRequest = await cloudApi.requestQuota(
          userId,
          requestedQuotaBytes,
          reason,
          {
            idempotencyKey: getOperationKey("quota-request", operationIdentity),
          },
        );
        completeOperation("quota-request", operationIdentity);
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
    [completeOperation, getOperationKey, userId],
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
    const generation = generationRef.current;
    const requestKey = queryKeyRef.current;
    const controller = new AbortController();
    const refreshProcessingItems = async () => {
      try {
        const page = await cloudApi.listItems(userId, {
          q: query,
          type: itemType,
          signal: controller.signal,
        });
        const hydratedItems = await hydrateMediaAccess(
          page.items,
          userId,
          controller.signal,
        );
        if (
          cancelled ||
          controller.signal.aborted ||
          !mountedRef.current ||
          generation !== generationRef.current ||
          requestKey !== queryKeyRef.current
        ) return;
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
        if (!cancelled && !controller.signal.aborted && mountedRef.current) {
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
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [
    hasProcessingItems,
    itemType,
    query,
    state.uploadProgress?.stage,
    userId,
  ]);

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
