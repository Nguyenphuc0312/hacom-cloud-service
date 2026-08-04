import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cloudApi, CloudApiError } from "../api/cloudApi";
import type {
  CloudHealth,
  CloudItem,
  CloudPage,
  CloudQuota,
  CloudUploadProgress,
} from "../types";

const PROCESSING_REFRESH_MS = 2_000;

interface CloudWorkspaceState {
  items: CloudItem[];
  quota: CloudQuota | null;
  health: CloudHealth | null;
  isLoading: boolean;
  isRefreshing: boolean;
  isLoadingMore: boolean;
  isMutating: boolean;
  error: CloudApiError | null;
  nextCursor?: string;
  uploadProgress: CloudUploadProgress | null;
}

const initialState: CloudWorkspaceState = {
  items: [],
  quota: null,
  health: null,
  isLoading: true,
  isRefreshing: false,
  isLoadingMore: false,
  isMutating: false,
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

const mergeItems = (current: CloudItem[], incoming: CloudItem[]): CloudItem[] => {
  const byId = new Map(current.map((item) => [item.id, item]));
  incoming.forEach((item) => byId.set(item.id, item));
  return Array.from(byId.values()).sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
};

export const useCloudWorkspace = (userId: string | undefined) => {
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
        const [page, quota, health] = await Promise.all([
          cloudApi.listItems(userId, { signal }),
          cloudApi.getQuota(userId, signal),
          cloudApi.health(signal).catch(
            (): CloudHealth => ({
              status: "DOWN",
              service: "hacom-cloud-api",
            }),
          ),
        ]);
        if (!mountedRef.current || signal?.aborted) return;
        setState((current) => ({
          ...current,
          items: page.items,
          quota,
          health,
          nextCursor: page.nextCursor,
          isLoading: false,
          isRefreshing: false,
          error: null,
        }));
      } catch (error) {
        if (signal?.aborted || !mountedRef.current) return;
        setState((current) => ({
          ...current,
          isLoading: false,
          isRefreshing: false,
          error: asCloudError(error),
        }));
      }
    },
    [userId],
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
      });
      if (!mountedRef.current) return;
      setState((current) => ({
        ...current,
        items: mergeItems(current.items, page.items),
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
  }, [state.isLoadingMore, state.nextCursor, userId]);

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
        const page = await cloudApi.listItems(userId);
        if (cancelled || !mountedRef.current) return;
        const stillProcessing = page.items.some(
          (item) => item.status === "processing",
        );
        setState((current) => ({
          ...current,
          items: mergeItems(current.items, page.items),
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
  }, [hasProcessingItems, state.uploadProgress?.stage, userId]);

  const clearError = useCallback(() => {
    setState((current) => ({ ...current, error: null }));
  }, []);

  return {
    ...state,
    refresh,
    loadMore,
    createText,
    createLink,
    uploadFile,
    clearError,
  };
};
