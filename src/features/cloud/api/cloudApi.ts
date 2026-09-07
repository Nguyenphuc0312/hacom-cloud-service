import { CLOUD_API_BASE_URL, CLOUD_HEALTH_URL } from "../../../config";
import { refreshAccessTokenShared } from "../../../services/authRefreshCoordinator";
import { getAccessToken } from "../../../services/tokenService";
import type {
  CloudHealth,
  CloudItemSummary,
  CloudDeleteResult,
  CloudFileAccess,
  CloudItem,
  CloudPage,
  CloudQuota,
  CloudQuotaRequest,
  CloudTrashLifecycle,
  CloudUploadComplete,
  CloudUploadSession,
} from "../types";

interface CloudErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
  };
}

interface CloudRequestOptions extends RequestInit {
  userId: string;
}

export class CloudApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;

  constructor(input: {
    status: number;
    code: string;
    message: string;
    requestId?: string;
  }) {
    super(input.message);
    this.name = "CloudApiError";
    this.status = input.status;
    this.code = input.code;
    this.requestId = input.requestId;
  }
}

const joinPath = (base: string, path: string): string =>
  `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;

const isCloudDemoMode = (): boolean => {
  const env = import.meta.env as Record<string, string | boolean | undefined>;
  return env.DEV === true && env["VITE_CLOUD_DEMO_MODE"] === "true";
};

export const resolveCloudObjectUrl = (presignedUrl: string): string => {
  if (!import.meta.env.DEV) return presignedUrl;

  try {
    const parsed = new URL(presignedUrl);
    if (parsed.hostname.toLowerCase() !== "host.docker.internal") {
      return presignedUrl;
    }
    const localPath = `/cloud-object${parsed.pathname}${parsed.search}`;
    return typeof window === "undefined"
      ? localPath
      : new URL(localPath, window.location.origin).toString();
  } catch {
    return presignedUrl;
  }
};

const parseJson = async <T>(response: Response): Promise<T> => {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new CloudApiError({
      status: response.status,
      code: "INVALID_RESPONSE",
      message: "Cloud API returned a non-JSON response",
      requestId: response.headers.get("x-request-id") ?? undefined,
    });
  }
  return (await response.json()) as T;
};

const cloudRequest = async <T>(
  path: string,
  { userId, headers, ...options }: CloudRequestOptions,
): Promise<T> => {
  const request = (accessToken?: string): Promise<Response> => {
    const requestHeaders = new Headers(headers);
    requestHeaders.set("Accept", "application/json");
    if (accessToken) {
      requestHeaders.set("Authorization", `Bearer ${accessToken}`);
    }
    if (isCloudDemoMode() && userId) {
      requestHeaders.set("X-Demo-User-ID", userId);
    } else {
      requestHeaders.delete("X-Demo-User-ID");
    }
    return fetch(joinPath(CLOUD_API_BASE_URL, path), {
      ...options,
      headers: requestHeaders,
    });
  };

  let response = await request(getAccessToken() ?? undefined);
  if (
    (response.status === 401 || response.status === 403) &&
    !isCloudDemoMode()
  ) {
    try {
      const refreshedToken = await refreshAccessTokenShared("http_401");
      response = await request(refreshedToken);
    } catch {
      // Preserve the original auth response and stable backend error code.
    }
  }

  if (!response.ok) {
    const payload = await parseJson<CloudErrorEnvelope>(response).catch(
      (): CloudErrorEnvelope => ({}),
    );
    // Some gateway/auth responses have an empty body. Keep those failures
    // distinguishable from a generic Cloud error so the UI can guide the
    // user back through Hacom Chat authentication instead of showing a
    // misleading retry-only message.
    const responseCode =
      payload.error?.code ??
      (response.status === 401 || response.status === 403
        ? "CLOUD_AUTH_REQUIRED"
        : response.status >= 500
          ? "CLOUD_UNAVAILABLE"
          : "CLOUD_REQUEST_FAILED");
    throw new CloudApiError({
      status: response.status,
      code: responseCode,
      message: payload.error?.message ?? "Cloud request failed",
      requestId: response.headers.get("x-request-id") ?? undefined,
    });
  }

  return parseJson<T>(response);
};

export const cloudApi = {
  async health(signal?: AbortSignal): Promise<CloudHealth> {
    const response = await fetch(CLOUD_HEALTH_URL, {
      headers: { Accept: "application/json" },
      signal,
    });
    if (!response.ok) {
      throw new CloudApiError({
        status: response.status,
        code: "CLOUD_UNAVAILABLE",
        message: "Cloud service is unavailable",
      });
    }
    return parseJson<CloudHealth>(response);
  },

  listItems(
    userId: string,
    options: {
      cursor?: string;
      limit?: number;
      q?: string;
      type?: CloudItem["type"];
      from?: string;
      to?: string;
      minSizeBytes?: number;
      maxSizeBytes?: number;
      sort?: "created_at" | "title" | "size_bytes";
      order?: "asc" | "desc";
      signal?: AbortSignal;
    } = {},
  ): Promise<CloudPage> {
    const query = new URLSearchParams();
    query.set("limit", String(options.limit ?? 30));
    if (options.cursor) query.set("cursor", options.cursor);
    if (options.q) query.set("q", options.q);
    if (options.type) query.set("type", options.type);
    if (options.from) query.set("from", options.from);
    if (options.to) query.set("to", options.to);
    if (options.minSizeBytes !== undefined) query.set("min_size_bytes", String(options.minSizeBytes));
    if (options.maxSizeBytes !== undefined) query.set("max_size_bytes", String(options.maxSizeBytes));
    if (options.sort) query.set("sort", options.sort);
    if (options.order) query.set("order", options.order);
    return cloudRequest<CloudPage>(`items?${query.toString()}`, {
      userId,
      signal: options.signal,
    });
  },

  getItemSummary(userId: string, signal?: AbortSignal): Promise<CloudItemSummary> {
    return cloudRequest<CloudItemSummary>("items/summary", { userId, signal });
  },

  listTrash(
    userId: string,
    options: {
      cursor?: string;
      limit?: number;
      q?: string;
      type?: CloudItem["type"];
      signal?: AbortSignal;
    } = {},
  ): Promise<CloudPage> {
    const query = new URLSearchParams();
    query.set("limit", String(options.limit ?? 30));
    if (options.cursor) query.set("cursor", options.cursor);
    if (options.q) query.set("q", options.q);
    if (options.type) query.set("type", options.type);
    return cloudRequest<CloudPage>(`trash?${query.toString()}`, {
      userId,
      signal: options.signal,
    });
  },

  getItem(
    userId: string,
    itemId: string,
    signal?: AbortSignal,
  ): Promise<CloudItem> {
    return cloudRequest<CloudItem>(`items/${encodeURIComponent(itemId)}`, {
      userId,
      signal,
    });
  },

  async getFileAccess(
    userId: string,
    itemId: string,
    signal?: AbortSignal,
  ): Promise<CloudFileAccess> {
    const access = await cloudRequest<CloudFileAccess>(
      `items/${encodeURIComponent(itemId)}/access`,
      { userId, signal },
    );
    return { ...access, url: resolveCloudObjectUrl(access.url) };
  },

  getQuota(userId: string, signal?: AbortSignal): Promise<CloudQuota> {
    return cloudRequest<CloudQuota>("quota", { userId, signal });
  },

  getCurrentQuotaRequest(
    userId: string,
    signal?: AbortSignal,
  ): Promise<CloudQuotaRequest> {
    return cloudRequest<CloudQuotaRequest>("quota/requests/current", {
      userId,
      signal,
    });
  },

  requestQuota(
    userId: string,
    requestedQuotaBytes: number,
    reason?: string,
  ): Promise<CloudQuotaRequest> {
    return cloudRequest<CloudQuotaRequest>("quota/requests", {
      userId,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `cloud-web-${crypto.randomUUID()}`,
      },
      body: JSON.stringify({
        requestedQuotaBytes,
        ...(reason?.trim() ? { reason: reason.trim() } : {}),
      }),
    });
  },

  createText(userId: string, content: string): Promise<CloudItem> {
    return cloudRequest<CloudItem>("texts", {
      userId,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  },

  createLink(userId: string, url: string, title: string): Promise<CloudItem> {
    return cloudRequest<CloudItem>("links", {
      userId,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, title }),
    });
  },

  trashItem(userId: string, itemId: string): Promise<CloudTrashLifecycle> {
    return cloudRequest<CloudTrashLifecycle>(
      `items/${encodeURIComponent(itemId)}/trash`,
      {
        userId,
        method: "POST",
        headers: { "Idempotency-Key": `cloud-web-${crypto.randomUUID()}` },
      },
    );
  },

  restoreItem(userId: string, itemId: string): Promise<CloudTrashLifecycle> {
    return cloudRequest<CloudTrashLifecycle>(
      `items/${encodeURIComponent(itemId)}/restore`,
      {
        userId,
        method: "POST",
        headers: { "Idempotency-Key": `cloud-web-${crypto.randomUUID()}` },
      },
    );
  },

  permanentlyDeleteItem(
    userId: string,
    itemId: string,
  ): Promise<CloudDeleteResult> {
    return cloudRequest<CloudDeleteResult>(
      `items/${encodeURIComponent(itemId)}`,
      {
        userId,
        method: "DELETE",
        headers: { "Idempotency-Key": `cloud-web-${crypto.randomUUID()}` },
      },
    );
  },

  initiateUpload(userId: string, file: File): Promise<CloudUploadSession> {
    return cloudRequest<CloudUploadSession>("uploads", {
      userId,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `cloud-web-${crypto.randomUUID()}`,
      },
      body: JSON.stringify({
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      }),
    });
  },

  uploadObject(
    session: CloudUploadSession,
    file: File,
    onProgress: (percent: number) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open(session.method, resolveCloudObjectUrl(session.uploadUrl));
      Object.entries(session.requiredHeaders).forEach(([name, value]) => {
        request.setRequestHeader(name, value);
      });
      request.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable && event.total > 0) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      });
      request.addEventListener("load", () => {
        if (request.status >= 200 && request.status < 300) {
          onProgress(100);
          resolve();
          return;
        }
        reject(
          new CloudApiError({
            status: request.status,
            code: "OBJECT_UPLOAD_FAILED",
            message: "Object storage rejected the upload",
          }),
        );
      });
      request.addEventListener("error", () => {
        reject(
          new CloudApiError({
            status: 0,
            code: "OBJECT_UPLOAD_NETWORK_ERROR",
            message: "Could not reach object storage",
          }),
        );
      });
      request.addEventListener("abort", () => {
        reject(
          new CloudApiError({
            status: 0,
            code: "OBJECT_UPLOAD_ABORTED",
            message: "Upload was cancelled",
          }),
        );
      });
      request.send(file);
    });
  },

  completeUpload(
    userId: string,
    sessionId: string,
  ): Promise<CloudUploadComplete> {
    return cloudRequest<CloudUploadComplete>(
      `uploads/${encodeURIComponent(sessionId)}/complete`,
      {
        userId,
        method: "POST",
      },
    );
  },
};
