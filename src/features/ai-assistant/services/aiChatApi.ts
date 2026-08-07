import { AI_CHAT_BASE_URL as BASE_URL } from "../../../services/ai-chat/constants";
import { getAccessToken } from "../../../services/tokenService";
import { fetchWithAuth } from "../../../services/ai-chat/fetchWithAuth";
import { openSSEStream } from "../../../services/ai-chat/sseWithAuth";
import aiChatClient from "../../../services/ai-chat/aiChatClient";
import { createNormalizedURLSearchParams } from "../../../utils/unicodeNormalize";

const ENDPOINTS = {
  company: `${BASE_URL}/api/chat/stream`,
  personal: `${BASE_URL}/api/chat/personal/stream`,
};
const WEEKLY_REPORT_BASE = `${BASE_URL}/api/chat/personal/weekly-report`;
const UPLOAD_ENDPOINTS = {
  personalWeeklyReport: `${WEEKLY_REPORT_BASE}/upload`,
  personalDocument: `${BASE_URL}/api/chat/personal/documents/upload`,
};
const WEEKLY_REPORT_FILES = {
  list: `${WEEKLY_REPORT_BASE}/files`,
  download: (fileId: number) => `${WEEKLY_REPORT_BASE}/files/${fileId}`,
  view: (fileId: number) => `${WEEKLY_REPORT_BASE}/files/${fileId}/view`,
};
const TIMEOUT_MS = 60_000;
const UPLOAD_TIMEOUT_MS = 120_000;

import type {
  AiChatRequest,
  AiChatResponse,
  WorkReportFormRequest,
  DepartmentSelectionRequest,
  WorkReportRecord,
  WorkReportAttachment,
} from "../types";
import { isDownloadLinkLabel } from "../utils/weeklyReportFileLink";
import { appendScopeToken } from "../../personal-ai/stores/workReportScopeStore";
import {
  readUploadFailureFromBody,
  shouldRefreshAndRetry,
  type UploadFailure,
} from "../../../services/ai-chat/uploadFailure";
import { refreshAccessTokenShared } from "../../../services/authRefreshCoordinator";

export class AiApiError extends Error {
  readonly status: number;
  readonly kind: "timeout" | "network" | "http";
  /**
   * Lý do BE trả trong body (contract FE 07/08/26 §2). `undefined` khi lỗi là
   * timeout/mạng — khi đó không có response nào để đọc.
   *
   * Trước đây lớp này chỉ giữ status, nên `uploadPersonalWeeklyReport` vứt sạch
   * `xhr.responseText` và mọi lỗi nghiệp vụ ("File sai form…", "File chứa công
   * việc của nhiều tuần…") đều hiện thành một câu chung vô nghĩa.
   */
  readonly failure?: UploadFailure;

  constructor(
    status: number,
    kind: "timeout" | "network" | "http" = "http",
    failure?: UploadFailure,
  ) {
    super(failure?.message ?? `AI API error [${kind}]: ${status}`);
    this.name = "AiApiError";
    this.status = status;
    this.kind = kind;
    this.failure = failure;
  }
}

/**
 * Sends a message to the AI chat API and handles the real-time SSE stream.
 *
 * Transport is delegated to `openSSEStream` (auth, retry, AbortController,
 * reader cleanup).  This function owns only domain-level event parsing.
 */
export function sendAiChatMessage(
  request: AiChatRequest,
  endpoint: "company" | "personal" = "company",
  options?: {
    /** External cancellation signal — wired to SSE cleanup on abort. */
    signal?: AbortSignal;
    /**
     * `event: session` đến TRƯỚC token đầu tiên và mang session_id thật mà BE
     * cấp cho cuộc hội thoại (mới: UUID riêng `chat-{user}-{uuid}`). Lưu ngay
     * để không phụ thuộc `event: done` — nếu stream lỗi giữa chừng, done không
     * phát ra, nhưng session_id đã được giữ.
     */
    onSession?: (sessionId: string) => void;
    onToken?: (token: string) => void;
    onThinking?: (thinking: string) => void;
    onFormRequest?: (data: WorkReportFormRequest) => void;
    onSelectionRequest?: (data: DepartmentSelectionRequest) => void;
  },
): Promise<AiChatResponse> {
  return new Promise((resolve, reject) => {
    let finalResponse: AiChatResponse | null = null;
    // Raw accumulated text is kept for the fallback regex parse — some AI
    // Chat service builds occasionally omit the `done` event's blank-line
    // separator, causing it to be missed during streaming chunk processing.
    let accumulatedRawData = "";
    // Token buffer used as last-resort answer when `done` event is absent.
    let tokenBuffer = "";

    const cleanup = openSSEStream(ENDPOINTS[endpoint], request, {
      signal: options?.signal,
      onEvent: (type, data) => {
        // Track raw for fallback regex
        accumulatedRawData += `event: ${type}\ndata: ${data}\n\n`;

        if (type === "session") {
          // { "session_id": "chat-{user}-{uuid}" }
          try {
            const parsed = JSON.parse(data) as { session_id?: unknown };
            const sid = typeof parsed?.session_id === "string" ? parsed.session_id : "";
            if (sid) options?.onSession?.(sid);
          } catch {
            // payload không phải JSON — bỏ qua
          }
        } else if (type === "token") {
          try {
            const parsed = JSON.parse(data) as { token?: unknown } | string;
            const token = String(
              typeof parsed === "object" && parsed !== null
                ? (parsed as { token?: unknown }).token ?? ""
                : parsed ?? "",
            );
            tokenBuffer += token;
            options?.onToken?.(token);
          } catch {
            tokenBuffer += data;
            options?.onToken?.(data);
          }
        } else if (type === "thinking") {
          options?.onThinking?.(data);
        } else if (type === "form_request") {
          try {
            const parsed = JSON.parse(data) as WorkReportFormRequest;
            if (parsed.form_type === "daily_work_report") {
              options?.onFormRequest?.(parsed);
            }
          } catch {
            // ignore malformed event
          }
        } else if (type === "selection_request") {
          try {
            const parsed = JSON.parse(data) as DepartmentSelectionRequest;
            if (
              parsed.selection_type === "department_report" ||
              parsed.selection_type === "company_department_report"
            ) {
              options?.onSelectionRequest?.(parsed);
            }
          } catch {
            // ignore malformed event
          }
        } else if (type === "done") {
          try {
            finalResponse = JSON.parse(data) as AiChatResponse;
          } catch {
            // Malformed done payload — fallback below
          }
        }
      },

      onComplete: () => {
        if (finalResponse) {
          resolve(finalResponse);
          return;
        }

        // Fallback: regex extraction for malformed SSE streams
        const doneMatch = accumulatedRawData.match(
          /event:\s*done\s*\ndata:\s*(.+)/,
        );
        if (doneMatch?.[1]) {
          try {
            resolve(JSON.parse(doneMatch[1]) as AiChatResponse);
            return;
          } catch {
            // ignore — fall through to token buffer
          }
        }

        // Last resort: synthesise a response from accumulated tokens
        if (tokenBuffer) {
          resolve({ session_id: request.session_id ?? "", answer: tokenBuffer });
          return;
        }

        reject(new AiApiError(0, "network"));
      },

      onError: (err) => {
        const kind: AiApiError["kind"] =
          err.kind === "timeout"
            ? "timeout"
            : err.kind === "network"
              ? "network"
              : "http";
        reject(new AiApiError(err.status, kind));
      },
    });

    // Wire caller's signal to SSE cleanup so aborting the signal also stops
    // the underlying stream reader AND settles the pending Promise.
    // Without the reject() call the Promise would hang forever because
    // openSSEStream silently skips onComplete/onError when aborted=true.
    options?.signal?.addEventListener("abort", () => {
      cleanup();
      reject(new DOMException("Stream aborted by user", "AbortError"));
    }, { once: true });
  });
}

export interface WeeklyReportFileItem {
  file_id: number;
  filename?: string;
  company?: string;
  week_start?: string;
  week_end?: string;
  created_at?: string;
  uploaded_at?: string;
  [key: string]: unknown;
}

export interface ListWeeklyReportFilesParams {
  week_start?: string;
  week_end?: string;
  company?: string;
  /** Mặc định 200, tối đa 500. */
  limit?: number;
}

export interface WeeklyReportUploadRequest {
  /** Câu hỏi của user về báo cáo — required, min length 1. */
  question: string;
  /** Mặc định "default" nếu không có session đang hoạt động. */
  session_id?: string;
  company?: string;
  week_start?: string;
  week_end?: string;
  /** Mã nhân sự */
  employee_code?: string;
  /** Tên nhân viên */
  employee_name?: string;
  /** Phòng ban */
  department?: string;
}

export interface WeeklyReportUploadResponse extends AiChatResponse {
  /** Trường mở rộng tuỳ backend trả về. */
  filename?: string;
  file_id?: string;
  [key: string]: unknown;
}

/**
 * Parse phần body trả về của endpoint upload weekly-report.
 * Endpoint có thể trả về JSON thường HOẶC SSE buffered text (cùng schema
 * với `/chat/personal/stream`). Hàm này thử cả hai để rút ra
 * `AiChatResponse`-compatible payload.
 */
function parseWeeklyReportUploadBody(
  text: string,
): WeeklyReportUploadResponse {
  const trimmed = text.trim();
  if (!trimmed) return { session_id: "", answer: "" };

  // 1) JSON trực tiếp
  try {
    const json = JSON.parse(trimmed);
    if (json && typeof json === "object") {
      return normalizeUploadResponse(json);
    }
  } catch {
    // fallthrough
  }

  // 2) SSE buffered — tìm event "done" cuối cùng
  const doneMatches = [
    ...trimmed.matchAll(/event:\s*done\s*\n\s*data:\s*(.+)/g),
  ];
  if (doneMatches.length > 0) {
    const lastData = doneMatches[doneMatches.length - 1][1].trim();
    try {
      return normalizeUploadResponse(JSON.parse(lastData));
    } catch {
      // fallthrough
    }
  }

  // 3) Fallback — gom text token nếu có
  const tokenChunks: string[] = [];
  const tokenMatches = trimmed.matchAll(/event:\s*token\s*\n\s*data:\s*(.+)/g);
  for (const match of tokenMatches) {
    const raw = match[1].trim();
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && "token" in parsed) {
        tokenChunks.push(String((parsed as { token?: unknown }).token ?? ""));
      } else if (typeof parsed === "string") {
        tokenChunks.push(parsed);
      }
    } catch {
      tokenChunks.push(raw);
    }
  }

  if (tokenChunks.length > 0) {
    return { session_id: "", answer: tokenChunks.join("") };
  }

  // 4) Last resort — trả raw text dưới dạng answer
  return { session_id: "", answer: trimmed };
}

function normalizeUploadResponse(value: unknown): WeeklyReportUploadResponse {
  const obj = (value ?? {}) as Record<string, unknown>;
  const answer =
    typeof obj.answer === "string"
      ? obj.answer
      : typeof obj.message === "string"
        ? (obj.message as string)
        : "";
  const sessionId =
    typeof obj.session_id === "string" ? (obj.session_id as string) : "";
  const sources = Array.isArray(obj.sources)
    ? (obj.sources as WeeklyReportUploadResponse["sources"])
    : undefined;
  return {
    ...obj,
    session_id: sessionId,
    answer,
    sources,
  } as WeeklyReportUploadResponse;
}

/**
 * Upload weekly report file kèm câu hỏi lên endpoint AI cá nhân.
 * Dùng XHR để có upload progress; response (JSON hoặc SSE buffered)
 * sẽ được chuẩn hoá thành `AiChatResponse`.
 *
 * Contract FE 07/08/26 §4: 401 kèm `action=refresh_token_and_retry` → làm mới
 * token và gửi lại ĐÚNG file/FormData này MỘT lần. Người dùng không phải chọn
 * lại tệp chỉ vì token vừa hết hạn giữa lúc nộp. Không retry với 400/403/409/
 * 429/5xx — đó là những lý do gửi lại y nguyên cũng hỏng y như cũ.
 */
export async function uploadPersonalWeeklyReport(
  file: File,
  body: WeeklyReportUploadRequest,
  options?: {
    onProgress?: (percent: number) => void;
    signal?: AbortSignal;
  },
): Promise<WeeklyReportUploadResponse> {
  try {
    return await postPersonalWeeklyReport(file, body, options);
  } catch (err) {
    if (!(err instanceof AiApiError) || !err.failure || !shouldRefreshAndRetry(err.failure)) {
      throw err;
    }
    // Đúng MỘT lần: 401 lần hai là hết phiên thật, retry tiếp chỉ thành vòng lặp.
    const fresh = await refreshAccessTokenShared("http_401").catch(() => null);
    if (!fresh) throw err;
    return postPersonalWeeklyReport(file, body, options);
  }
}

function postPersonalWeeklyReport(
  file: File,
  body: WeeklyReportUploadRequest,
  options?: {
    onProgress?: (percent: number) => void;
    signal?: AbortSignal;
  },
): Promise<WeeklyReportUploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = UPLOAD_ENDPOINTS.personalWeeklyReport;
    const timeoutId = window.setTimeout(() => {
      xhr.abort();
      reject(new AiApiError(0, "timeout"));
    }, UPLOAD_TIMEOUT_MS);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      if (options?.signal) {
        options.signal.removeEventListener("abort", handleAbort);
      }
    };

    const handleAbort = () => {
      xhr.abort();
      cleanup();
      reject(new AiApiError(0, "timeout"));
    };

    if (options?.signal) {
      if (options.signal.aborted) {
        cleanup();
        reject(new AiApiError(0, "timeout"));
        return;
      }
      options.signal.addEventListener("abort", handleAbort);
    }

    const form = new FormData();
    // ── Field order theo schema multipart/form-data của backend ──
    form.append("session_id", body.session_id?.trim() || "default");
    form.append("question", body.question);
    form.append("company", body.company ?? "");
    form.append("week_start", body.week_start ?? "");
    form.append("week_end", body.week_end ?? "");
    form.append("employee_code", body.employee_code ?? "");
    form.append("employee_name", body.employee_name ?? "");
    form.append("department", body.department ?? "");
    form.append("file", file, file.name);

    xhr.open("POST", url, true);
    xhr.responseType = "text";

    // Inject Bearer token — XHR cannot participate in the Axios interceptor
    // chain, so we read the token directly and set the header manually.
    const xhrToken = getAccessToken();
    if (xhrToken) {
      xhr.setRequestHeader("Authorization", `Bearer ${xhrToken}`);
    }

    if (options?.onProgress) {
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable && event.total > 0) {
          const percent = Math.min(
            100,
            Math.round((event.loaded / event.total) * 100),
          );
          options.onProgress?.(percent);
        }
      });
    }

    xhr.addEventListener("load", () => {
      cleanup();
      const status = xhr.status;
      const text = xhr.responseText ?? "";
      if (status >= 200 && status < 300) {
        resolve(parseWeeklyReportUploadBody(text));
        return;
      }
      // §2: đọc body TRƯỚC khi quyết định câu hiển thị. BE trả lý do cụ thể
      // (sai form, nhiều tuần, nộp thay người khác…) — nuốt nó là bug gốc.
      reject(
        new AiApiError(
          status,
          "http",
          readUploadFailureFromBody(status, text, xhr.getResponseHeader("Retry-After")),
        ),
      );
    });

    xhr.addEventListener("error", () => {
      cleanup();
      reject(new AiApiError(0, "network"));
    });

    xhr.addEventListener("abort", () => {
      cleanup();
      reject(new AiApiError(0, "timeout"));
    });

    xhr.send(form);
  });
}

function buildWeeklyReportFilesQuery(
  params?: ListWeeklyReportFilesParams,
): string {
  const search = createNormalizedURLSearchParams({
    week_start: params?.week_start?.trim(),
    week_end: params?.week_end?.trim(),
    company: params?.company?.trim(),
    limit: String(Math.min(500, Math.max(1, params?.limit ?? 200))),
  });
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

async function aiGetRequest(
  url: string,
  options?: { signal?: AbortSignal },
): Promise<Response> {
  try {
    const response = await fetchWithAuth(
      url,
      { method: "GET" },
      { signal: options?.signal, timeoutMs: TIMEOUT_MS },
    );
    if (!response.ok) {
      throw new AiApiError(response.status, "http");
    }
    return response;
  } catch (err) {
    if (err instanceof AiApiError) throw err;
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new AiApiError(0, "timeout");
    }
    if (err instanceof Error && err.name === "AbortError") {
      throw new AiApiError(0, "timeout");
    }
    throw new AiApiError(0, "network");
  }
}

function normalizeWeeklyReportFileList(payload: unknown): WeeklyReportFileItem[] {
  if (Array.isArray(payload)) {
    return payload
      .map(normalizeWeeklyReportFileItem)
      .filter((item): item is WeeklyReportFileItem => item !== null);
  }

  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    for (const key of ["files", "items", "data", "results"]) {
      const nested = obj[key];
      if (Array.isArray(nested)) {
        return normalizeWeeklyReportFileList(nested);
      }
    }
  }

  return [];
}

function normalizeWeeklyReportFileItem(
  value: unknown,
): WeeklyReportFileItem | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const rawId = obj.file_id ?? obj.id ?? obj.fileId;
  const fileId =
    typeof rawId === "number"
      ? rawId
      : typeof rawId === "string"
        ? Number.parseInt(rawId, 10)
        : NaN;
  if (!Number.isFinite(fileId)) return null;

  const filename =
    typeof obj.filename === "string"
      ? obj.filename
      : typeof obj.file_name === "string"
        ? obj.file_name
        : typeof obj.name === "string"
          ? obj.name
          : undefined;

  return {
    ...obj,
    file_id: fileId,
    filename,
    company: typeof obj.company === "string" ? obj.company : undefined,
    week_start:
      typeof obj.week_start === "string" ? obj.week_start : undefined,
    week_end: typeof obj.week_end === "string" ? obj.week_end : undefined,
    created_at:
      typeof obj.created_at === "string" ? obj.created_at : undefined,
    uploaded_at:
      typeof obj.uploaded_at === "string" ? obj.uploaded_at : undefined,
  };
}

function isWeeklyReportFilesPath(pathname: string): boolean {
  return pathname.includes("/api/chat/personal/weekly-report/files/");
}

function isLocalDevHost(hostname: string, port: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    port === "5100"
  );
}

/** Luôn chuyển path/URL tương đối (hoặc nhầm localhost) sang host AI thật. */
function toAbsoluteAiUrl(pathOrUrl: string): string {
  const trimmed = pathOrUrl.trim();
  if (!trimmed) return trimmed;

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const parsed = new URL(trimmed);
      if (
        isWeeklyReportFilesPath(parsed.pathname) &&
        isLocalDevHost(parsed.hostname, parsed.port)
      ) {
        return `${BASE_URL}${parsed.pathname}${parsed.search}`;
      }
      return trimmed;
    } catch {
      return trimmed;
    }
  }

  if (trimmed.startsWith("/")) {
    return `${BASE_URL}${trimmed}`;
  }
  return `${BASE_URL}/${trimmed.replace(/^\//, "")}`;
}

function resolveResourceUrl(value: string): string {
  return toAbsoluteAiUrl(value);
}

function extractUrlFromPayload(payload: unknown): string | null {
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      return extractUrlFromPayload(parsed);
    } catch {
      return resolveResourceUrl(trimmed);
    }
  }

  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    for (const key of [
      "url",
      "view_url",
      "download_url",
      "file_url",
      "link",
      "href",
    ]) {
      const candidate = obj[key];
      if (typeof candidate === "string" && candidate.trim()) {
        return resolveResourceUrl(candidate);
      }
    }
  }

  return null;
}

async function parseJsonOrTextResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  const text = await response.text();
  if (!text.trim()) return "";
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function parseContentDispositionFilename(header: string | null): string | null {
  if (!header) return null;
  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }
  const quoted = header.match(/filename="([^"]+)"/i);
  if (quoted?.[1]) return quoted[1];
  const plain = header.match(/filename=([^;]+)/i);
  return plain?.[1]?.trim() ?? null;
}

/**
 * GET /api/chat/personal/weekly-report/files
 */
export async function listPersonalWeeklyReportFiles(
  params?: ListWeeklyReportFilesParams,
  options?: { signal?: AbortSignal },
): Promise<WeeklyReportFileItem[]> {
  const url = `${WEEKLY_REPORT_FILES.list}${buildWeeklyReportFilesQuery(params)}`;
  const response = await aiGetRequest(url, options);
  const payload = await parseJsonOrTextResponse(response);
  return normalizeWeeklyReportFileList(payload);
}

export interface WeeklyReportFileBlob {
  blob: Blob;
  filename: string;
  mimeType: string;
}

const FILENAME_CACHE_TTL_MS = 60_000;
let weeklyReportFilenameCache = new Map<number, string>();
let weeklyReportFilenameCacheAt = 0;

function isUsableFilenameCandidate(value: string | undefined): value is string {
  if (!value?.trim()) return false;
  return !isDownloadLinkLabel(value);
}

function extractFilenameFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  for (const key of [
    "filename",
    "file_name",
    "original_filename",
    "original_name",
    "name",
  ]) {
    const candidate = obj[key];
    if (typeof candidate === "string" && isUsableFilenameCandidate(candidate)) {
      return candidate.trim();
    }
  }
  return null;
}

async function refreshWeeklyReportFilenameCache(): Promise<void> {
  const files = await listPersonalWeeklyReportFiles({ limit: 500 });
  const next = new Map<number, string>();
  for (const item of files) {
    if (item.filename?.trim()) {
      next.set(item.file_id, item.filename.trim());
    }
  }
  weeklyReportFilenameCache = next;
  weeklyReportFilenameCacheAt = Date.now();
}

/**
 * Lấy tên file gốc theo file_id (từ hint hoặc API danh sách).
 * Tránh lưu máy thành weekly-report-{id}.xlsx khi user bấm "Tải về".
 */
export async function resolveWeeklyReportFilename(
  fileId: number,
  hint?: string,
): Promise<string> {
  if (isUsableFilenameCandidate(hint)) {
    return hint.trim();
  }

  const now = Date.now();
  if (now - weeklyReportFilenameCacheAt > FILENAME_CACHE_TTL_MS) {
    try {
      await refreshWeeklyReportFilenameCache();
    } catch {
      // Giữ cache cũ nếu refresh thất bại
    }
  }

  const cached = weeklyReportFilenameCache.get(fileId);
  if (cached) {
    return cached;
  }

  if (weeklyReportFilenameCacheAt === 0) {
    try {
      await refreshWeeklyReportFilenameCache();
      const refreshed = weeklyReportFilenameCache.get(fileId);
      if (refreshed) return refreshed;
    } catch {
      // fallthrough
    }
  }

  return `weekly-report-${fileId}`;
}

/** Xoá cache tên file (gọi sau khi upload thành công). */
export function invalidateWeeklyReportFilenameCache(): void {
  weeklyReportFilenameCacheAt = 0;
  weeklyReportFilenameCache.clear();
}

/**
 * Fetch nội dung file từ API AI (theo chế độ view hoặc download).
 * Không bao giờ trả URL tương đối — luôn lấy blob từ host AI.
 */
export async function fetchPersonalWeeklyReportFileBlob(
  fileId: number,
  mode: "view" | "download",
  fallbackFilename?: string,
  options?: { signal?: AbortSignal },
): Promise<WeeklyReportFileBlob> {
  const primaryUrl =
    mode === "view"
      ? WEEKLY_REPORT_FILES.view(fileId)
      : WEEKLY_REPORT_FILES.download(fileId);
  const defaultName = fallbackFilename || `weekly-report-${fileId}`;
  return fetchFileBlobFromApiUrl(primaryUrl, defaultName, options);
}

async function fetchFileBlobFromApiUrl(
  url: string,
  fallbackFilename: string,
  options?: { signal?: AbortSignal },
  depth = 0,
): Promise<WeeklyReportFileBlob> {
  if (depth > 3) {
    throw new AiApiError(0, "http");
  }

  const absoluteUrl = toAbsoluteAiUrl(url);
  const response = await aiGetRequest(absoluteUrl, options);
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const payload = await parseJsonOrTextResponse(response);
    const filenameFromJson = extractFilenameFromPayload(payload);
    const nextFilename =
      filenameFromJson && isUsableFilenameCandidate(filenameFromJson)
        ? filenameFromJson
        : fallbackFilename;
    const nextUrl = extractUrlFromPayload(payload);
    if (!nextUrl) {
      throw new AiApiError(0, "http");
    }
    const nextAbsolute = toAbsoluteAiUrl(nextUrl);
    if (nextAbsolute === absoluteUrl) {
      throw new AiApiError(0, "http");
    }
    return fetchFileBlobFromApiUrl(
      nextUrl,
      nextFilename,
      options,
      depth + 1,
    );
  }

  const blob = await response.blob();
  const filename =
    parseContentDispositionFilename(
      response.headers.get("content-disposition"),
    ) ||
    (isUsableFilenameCandidate(fallbackFilename) ? fallbackFilename : null) ||
    fallbackFilename;

  return {
    blob,
    filename,
    mimeType: blob.type || contentType || "application/octet-stream",
  };
}

/**
 * GET .../files/{file_id}/view — tải blob và mở xem trên trình duyệt.
 */
export async function openPersonalWeeklyReportFilePreview(
  fileId: number,
  fallbackFilename?: string,
  options?: { signal?: AbortSignal },
): Promise<WeeklyReportFileBlob> {
  return fetchPersonalWeeklyReportFileBlob(
    fileId,
    "view",
    fallbackFilename,
    options,
  );
}

/** @deprecated Dùng openPersonalWeeklyReportFilePreview — giữ để tương thích. */
export async function getPersonalWeeklyReportFileViewUrl(
  fileId: number,
  options?: { signal?: AbortSignal },
): Promise<string> {
  const { blob } = await openPersonalWeeklyReportFilePreview(
    fileId,
    undefined,
    options,
  );
  return URL.createObjectURL(blob);
}

/**
 * GET .../files/{file_id} — tải blob từ API AI rồi lưu về máy.
 */
export async function downloadPersonalWeeklyReportFile(
  fileId: number,
  fallbackFilename?: string,
  options?: { signal?: AbortSignal },
): Promise<void> {
  const resolvedFilename = await resolveWeeklyReportFilename(
    fileId,
    fallbackFilename,
  );
  const { blob, filename } = await fetchPersonalWeeklyReportFileBlob(
    fileId,
    "download",
    resolvedFilename,
    options,
  );
  const objectUrl = URL.createObjectURL(blob);
  const downloadName =
    isUsableFilenameCandidate(filename) ? filename : resolvedFilename;
  triggerBrowserDownload(objectUrl, downloadName, true);
}

function triggerBrowserDownload(
  href: string,
  filename?: string,
  revokeObjectUrl = false,
): void {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.rel = "noopener noreferrer";
  if (filename) {
    anchor.download = filename;
  }
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  if (revokeObjectUrl) {
    window.setTimeout(() => URL.revokeObjectURL(href), 0);
  }
}

// ---------------------------------------------------------------------------
// Personal Document Upload
// ---------------------------------------------------------------------------

/** Response trả về từ endpoint upload tài liệu cá nhân. */
export interface PersonalDocumentUploadResponse {
  /** Thông báo từ server (thành công / lỗi). */
  message?: string;
  /** ID tài liệu được lưu trên server (nếu có). */
  document_id?: string;
  /** Tên file gốc mà server ghi nhận. */
  filename?: string;
  [key: string]: unknown;
}

/**
 * Upload một tài liệu cá nhân lên endpoint `/api/chat/personal/documents/upload`.
 *
 * Sử dụng `aiChatClient` (Axios instance đã cấu hình interceptor) để request
 * tự động được gắn `Authorization: Bearer <token>` mà không cần xử lý thủ công.
 *
 * **Lưu ý quan trọng về Content-Type:**
 * KHÔNG được set `'Content-Type': 'multipart/form-data'` thủ công.
 * Khi truyền `FormData`, Axios + Browser sẽ tự sinh header chuẩn kèm `boundary`
 * chính xác. Set cứng sẽ khiến backend không parse được multipart payload.
 */
export async function uploadPersonalDocument(
  file: File,
  options?: {
    /** Callback nhận phần trăm tiến độ upload (0–100) để cập nhật UI. */
    onProgress?: (pct: number) => void;
    /** AbortSignal từ AbortController để hủy request giữa chừng nếu cần. */
    signal?: AbortSignal;
  },
): Promise<PersonalDocumentUploadResponse> {
  // Đóng gói file vào FormData — chỉ đúng 1 field "file" theo yêu cầu backend
  const form = new FormData();
  form.append("file", file, file.name);

  const { data } = await aiChatClient.post<PersonalDocumentUploadResponse>(
    UPLOAD_ENDPOINTS.personalDocument,
    form,
    {
      // Truyền AbortSignal vào Axios để hủy request khi component unmount
      // hoặc khi user bấm nút hủy upload
      signal: options?.signal,

      // Theo dõi tiến độ upload và thông báo ra UI qua callback onProgress
      onUploadProgress: options?.onProgress
        ? (event) => {
            if (event.total && event.total > 0) {
              const pct = Math.min(
                100,
                Math.round((event.loaded / event.total) * 100),
              );
              options.onProgress!(pct);
            }
          }
        : undefined,
    },
  );

  // Trả về trực tiếp data từ response — interceptor đã xử lý lỗi 4xx/5xx
  return data;
}

// ---------------------------------------------------------------------------
// Work Report API
// ---------------------------------------------------------------------------

const WORK_REPORTS_URL = `${BASE_URL}/api/work-reports`;

export interface WorkReportTaskSubmit {
  /**
   * Id công việc đang có (round-trip khi SỬA). Bỏ trống khi tạo việc mới —
   * BE sẽ cấp id mới. Gửi lại id để giữ liên kết file ↔ việc.
   */
  id?: string;
  /**
   * Khoá tương quan do CLIENT sinh (ổn định theo dòng việc đang nhập). BE chỉ
   * cần echo lại nguyên văn trong `report.tasks[].client_task_id` để FE map
   * đúng việc → id thật mà KHÔNG phụ thuộc thứ tự/tên (xử lý append nhiều việc,
   * trùng tên). BE chưa hỗ trợ → field bị bỏ qua, FE fallback theo id/tên/vị trí.
   */
  client_task_id?: string;
  task_name: string;
  /** Deadline "yyyy-mm-dd" (native date input) — rỗng/sai BE bỏ trống, không chặn lưu. */
  completion_date?: string;
  requirements?: string;
  completed?: string;
  difficulties?: string;
  /** "Đề xuất" — không bắt buộc; rỗng/thiếu BE lưu trống, không chặn lưu. */
  proposals?: string;
  notes?: string;
}

export interface WorkReportSubmitBody {
  employee_code: string;
  employee_name?: string;
  department_name?: string;
  org_unit?: string;
  report_date: string;
  tasks: WorkReportTaskSubmit[];
  notes?: string;
}

/** Một công việc trong response — BE trả kèm `id` để FE round-trip & gắn file. */
export interface WorkReportTaskResult extends WorkReportTaskSubmit {
  id?: string;
  /** Echo lại `client_task_id` của payload (nếu BE đã hỗ trợ) để FE map 1-1. */
  client_task_id?: string;
}

export interface WorkReportSubmitResponse {
  ok: boolean;
  report: {
    id: number;
    report_date: string;
    tasks?: WorkReportTaskResult[];
    notes?: string;
    task_name?: string;
    requirements?: string;
    completed?: string;
    difficulties?: string;
  };
}

export async function submitWorkReport(
  body: WorkReportSubmitBody,
  options?: { signal?: AbortSignal },
): Promise<WorkReportSubmitResponse> {
  const response = await fetchWithAuth(
    WORK_REPORTS_URL,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    { signal: options?.signal, timeoutMs: TIMEOUT_MS },
  );
  if (!response.ok) {
    let detail = "Lỗi không xác định";
    try {
      const err = await response.json() as { detail?: string };
      if (err.detail) detail = err.detail;
    } catch { /* ignore */ }
    if (response.status === 503) {
      throw new Error("Chức năng chưa được cấu hình, liên hệ quản trị viên");
    }
    throw new Error(detail);
  }
  return response.json() as Promise<WorkReportSubmitResponse>;
}

// ---------------------------------------------------------------------------
// Work Report file attachments (cấp ngày) + In bảng
// ---------------------------------------------------------------------------

const WORK_REPORT_FILES_URL = `${WORK_REPORTS_URL}/files`;
const WORK_REPORT_PRINT_TABLE_URL = `${WORK_REPORTS_URL}/print-table`;

async function readErrorDetail(response: Response, fallback: string): Promise<string> {
  try {
    const err = (await response.json()) as { detail?: string };
    if (err?.detail) return err.detail;
  } catch {
    /* không phải JSON */
  }
  return fallback;
}

export interface WorkReportFileUploadResponse {
  ok: boolean;
  file: {
    id: number;
    task_id?: string | null;
    report_date: string;
    filename: string;
    file_size?: number;
    content_type?: string;
    download_url: string;
  };
}

export interface UploadWorkReportFileParams {
  /** Ngày báo cáo YYYY-MM-DD; mặc định hôm nay nếu bỏ trống. */
  reportDate?: string;
  /**
   * Id công việc để gắn file (chế độ attach_level="task"). Bỏ trống → file
   * "chung" (task_id=null). BẮT BUỘC khi BE bật attach_requires_task.
   */
  taskId?: string;
}

/** POST /api/work-reports/files — đính kèm file cho báo cáo ngày (kèm task_id nếu theo việc). */
export async function uploadWorkReportFile(
  file: File,
  params?: UploadWorkReportFileParams,
  options?: { signal?: AbortSignal },
): Promise<WorkReportFileUploadResponse> {
  const form = new FormData();
  form.append("file", file, file.name);
  if (params?.reportDate) form.append("report_date", params.reportDate);
  if (params?.taskId) form.append("task_id", params.taskId);

  // KHÔNG set Content-Type — trình duyệt tự thêm boundary cho multipart.
  const response = await fetchWithAuth(
    WORK_REPORT_FILES_URL,
    { method: "POST", body: form },
    { signal: options?.signal, timeoutMs: UPLOAD_TIMEOUT_MS },
  );
  if (!response.ok) {
    if (response.status === 413) {
      throw new Error("Tệp vượt quá dung lượng cho phép (tối đa 25MB).");
    }
    if (response.status === 403) {
      throw new Error("Bạn không có quyền đính kèm tệp này.");
    }
    // 400 mang detail rõ ràng từ BE (thiếu task_id / task không thuộc báo cáo /
    // định dạng / ngày tương lai / file trống).
    throw new Error(await readErrorDetail(response, "Không thể tải tệp lên"));
  }
  return response.json() as Promise<WorkReportFileUploadResponse>;
}

export interface WorkReportFilesListResponse {
  count: number;
  report_date: string;
  items: WorkReportAttachment[];
}

/** GET /api/work-reports/files — file của mình (mặc định hôm nay) hoặc của NV nếu là quản lý. */
export async function listWorkReportFiles(
  params: { reportDate?: string; employeeCode?: string },
  options?: { signal?: AbortSignal },
): Promise<WorkReportFilesListResponse> {
  const qs = new URLSearchParams();
  if (params.reportDate) qs.set("report_date", params.reportDate);
  if (params.employeeCode) qs.set("employee_code", params.employeeCode);
  // §4: danh sách file người khác gửi scope_token qua query.
  appendScopeToken(qs);
  const query = qs.toString();
  const url = query ? `${WORK_REPORT_FILES_URL}?${query}` : WORK_REPORT_FILES_URL;

  const response = await fetchWithAuth(
    url,
    { method: "GET" },
    { signal: options?.signal, timeoutMs: TIMEOUT_MS },
  );
  if (!response.ok) {
    if (response.status === 403) {
      throw new Error("Bạn không có quyền xem tệp của nhân viên này.");
    }
    throw new Error(await readErrorDetail(response, "Không thể tải danh sách tệp"));
  }
  return response.json() as Promise<WorkReportFilesListResponse>;
}

/** GET /api/work-reports/files/{id} — tải blob kèm auth (chưa lưu xuống máy). */
export async function fetchWorkReportFileBlob(
  id: number,
  fallbackName?: string,
  options?: { signal?: AbortSignal },
): Promise<{ blob: Blob; filename: string }> {
  // §4: xem/tải file gửi scope_token qua query — dùng chung cho cả
  // downloadWorkReportFile (route qua hàm này) nên chỉ cần gắn một chỗ.
  const fileQs = appendScopeToken(new URLSearchParams()).toString();
  const response = await fetchWithAuth(
    fileQs
      ? `${WORK_REPORT_FILES_URL}/${id}?${fileQs}`
      : `${WORK_REPORT_FILES_URL}/${id}`,
    { method: "GET" },
    { signal: options?.signal, timeoutMs: UPLOAD_TIMEOUT_MS },
  );
  if (!response.ok) {
    if (response.status === 403) throw new Error("Bạn không có quyền tải tệp này.");
    if (response.status === 404) throw new Error("Tệp không tồn tại.");
    throw new Error(await readErrorDetail(response, "Không thể tải tệp"));
  }
  // Ưu tiên tên gốc do caller truyền; header X-File-Name là phương án dự phòng.
  const filename =
    fallbackName ||
    response.headers.get("X-File-Name") ||
    response.headers.get("X-Original-Filename") ||
    `work-report-file-${id}`;
  const blob = await response.blob();
  return { blob, filename };
}

/** GET /api/work-reports/files/{id} — tải file (kích hoạt download trên trình duyệt). */
export async function downloadWorkReportFile(
  id: number,
  fallbackName?: string,
  options?: { signal?: AbortSignal },
): Promise<void> {
  const { blob, filename } = await fetchWorkReportFileBlob(id, fallbackName, options);
  const objectUrl = URL.createObjectURL(blob);
  triggerBrowserDownload(objectUrl, filename, true);
}

/** DELETE /api/work-reports/files/{id} — chỉ chủ file. */
export async function deleteWorkReportFile(
  id: number,
  options?: { signal?: AbortSignal },
): Promise<void> {
  const response = await fetchWithAuth(
    `${WORK_REPORT_FILES_URL}/${id}`,
    { method: "DELETE" },
    { signal: options?.signal, timeoutMs: TIMEOUT_MS },
  );
  if (!response.ok) {
    if (response.status === 403) throw new Error("Chỉ chủ tệp mới được xoá.");
    if (response.status === 404) throw new Error("Tệp không tồn tại.");
    throw new Error(await readErrorDetail(response, "Không thể xoá tệp"));
  }
}

export interface DeleteWorkReportTaskResponse {
  ok: boolean;
  deleted_task_id: string;
}

/**
 * DELETE /api/work-reports/tasks/{task_id} — xóa một công việc (kèm file riêng
 * của nó). Chỉ owner (chủ báo cáo) được xóa. 403 nếu không phải owner, 404 nếu
 * công việc không tồn tại.
 */
export async function deleteWorkReportTask(
  taskId: string,
  options?: { signal?: AbortSignal },
): Promise<DeleteWorkReportTaskResponse> {
  const response = await fetchWithAuth(
    `${WORK_REPORTS_URL}/tasks/${encodeURIComponent(taskId)}`,
    { method: "DELETE" },
    { signal: options?.signal, timeoutMs: TIMEOUT_MS },
  );
  if (!response.ok) {
    if (response.status === 403) throw new Error("Chỉ chủ báo cáo mới được xóa công việc.");
    if (response.status === 404) throw new Error("Công việc không tồn tại.");
    throw new Error(await readErrorDetail(response, "Không thể xóa công việc"));
  }
  return response.json() as Promise<DeleteWorkReportTaskResponse>;
}

/** POST /api/work-reports/print-table — trả HTML hoàn chỉnh để mở & tự in. */
export async function printWorkReportTable(
  title: string,
  content: string,
  options?: { signal?: AbortSignal },
): Promise<string> {
  const response = await fetchWithAuth(
    WORK_REPORT_PRINT_TABLE_URL,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content }),
    },
    { signal: options?.signal, timeoutMs: TIMEOUT_MS },
  );
  if (!response.ok) {
    if (response.status === 400) throw new Error("Nội dung in trống.");
    throw new Error(await readErrorDetail(response, "Không thể tạo bản in"));
  }
  return response.text();
}

export interface FetchWorkReportsParams {
  department?: string;
  employee_code?: string;
  company?: string;
  start?: string;
  end?: string;
}

export interface WorkReportsResponse {
  mode: string;
  department?: string;
  company?: string;
  start: string;
  end: string;
  count: number;
  reports: WorkReportRecord[];
}

export async function fetchWorkReports(
  params: FetchWorkReportsParams,
  options?: { signal?: AbortSignal },
): Promise<WorkReportsResponse> {
  const search = createNormalizedURLSearchParams({
    department: params.department,
    employee_code: params.employee_code,
    company: params.company,
    start: params.start,
    end: params.end,
  });
  // §4: xem báo cáo gửi scope_token qua query (URLSearchParams tự encode).
  appendScopeToken(search);
  const qs = search.toString();
  const url = qs ? `${WORK_REPORTS_URL}?${qs}` : WORK_REPORTS_URL;
  const response = await aiGetRequest(url, options);
  return response.json() as Promise<WorkReportsResponse>;
}

export interface DepartmentListItem {
  department: string;
  company: string;
  count: number;
}

export interface DepartmentsResponse {
  departments: DepartmentListItem[];
  count: number;
}

export async function fetchDepartments(
  options?: { signal?: AbortSignal },
): Promise<DepartmentsResponse> {
  const response = await aiGetRequest(`${WORK_REPORTS_URL}/departments`, options);
  return response.json() as Promise<DepartmentsResponse>;
}

// ---------------------------------------------------------------------------
// Chat source documents (Nguồn tham khảo)
// ---------------------------------------------------------------------------

/**
 * Tải tài liệu nguồn (khối "Nguồn tham khảo") qua auth-fetch rồi trả blob URL.
 * Link mở tab mới KHÔNG mang Bearer header nên phải fetch có auth ở đây; BE có
 * thể redirect /api/sources/{id} → /api/source-files/{code}, fetch follow mặc định.
 * Caller tự mở blobUrl và revoke sau khi dùng.
 */
export async function fetchAiSourceBlobUrl(
  absoluteUrl: string,
  options?: { signal?: AbortSignal },
): Promise<string> {
  const response = await fetchWithAuth(
    absoluteUrl,
    { method: "GET" },
    { signal: options?.signal, timeoutMs: TIMEOUT_MS },
  );
  if (!response.ok) {
    throw new AiApiError(response.status, "http");
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

// ---------------------------------------------------------------------------
// Personal Sessions API
// ---------------------------------------------------------------------------

export interface PersonalSession {
  session_id: string;
  title?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface PersonalSessionsResponse {
  sessions: PersonalSession[];
}

/**
 * DELETE /api/sessions/{session_id} — xóa session AI công ty.
 * Backend kiểm tra ownership qua chat-{user_key}- hoặc chat-{emp_key}- prefix.
 * 404 được coi là thành công (session đã bị xóa từ trước).
 */
export async function deleteCompanySession(
  sessionId: string,
  options?: { signal?: AbortSignal },
): Promise<void> {
  const response = await fetchWithAuth(
    `${BASE_URL}/api/sessions/${sessionId}`,
    { method: "DELETE" },
    { signal: options?.signal, timeoutMs: TIMEOUT_MS },
  );
  if (!response.ok && response.status !== 404) {
    throw new AiApiError(response.status, "http");
  }
}

/**
 * DELETE /api/personal/sessions/{session_id} — xóa session AI cá nhân.
 * 404 được coi là thành công (session đã bị xóa từ trước).
 */
export async function deletePersonalSession(
  sessionId: string,
  options?: { signal?: AbortSignal },
): Promise<void> {
  const response = await fetchWithAuth(
    `${BASE_URL}/api/personal/sessions/${sessionId}`,
    { method: "DELETE" },
    { signal: options?.signal, timeoutMs: TIMEOUT_MS },
  );
  if (!response.ok && response.status !== 404) {
    throw new AiApiError(response.status, "http");
  }
}

/**
 * PATCH /api/sessions/{session_id} — đổi tên session AI công ty.
 * 404 coi là thành công mềm (session đã xoá); FE vẫn giữ tên local dù BE chưa
 * hỗ trợ endpoint — gọi best-effort, không chặn UI.
 */
export async function renameCompanySession(
  sessionId: string,
  title: string,
  options?: { signal?: AbortSignal },
): Promise<void> {
  const response = await fetchWithAuth(
    `${BASE_URL}/api/sessions/${sessionId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    },
    { signal: options?.signal, timeoutMs: TIMEOUT_MS },
  );
  if (!response.ok && response.status !== 404) {
    throw new AiApiError(response.status, "http");
  }
}

/**
 * PATCH /api/personal/sessions/{session_id} — đổi tên session AI cá nhân.
 * Cùng quy ước 404-mềm + best-effort như {@link renameCompanySession}.
 */
export async function renamePersonalSession(
  sessionId: string,
  title: string,
  options?: { signal?: AbortSignal },
): Promise<void> {
  const response = await fetchWithAuth(
    `${BASE_URL}/api/personal/sessions/${sessionId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    },
    { signal: options?.signal, timeoutMs: TIMEOUT_MS },
  );
  if (!response.ok && response.status !== 404) {
    throw new AiApiError(response.status, "http");
  }
}

export interface PersonalSessionMessage {
  id: string;
  // Backend trả cả role nội bộ của tool-calling ("assistant_tool_call",
  // "tool") bên cạnh "user"/"assistant". Khai báo rộng để consumer lọc đúng.
  role: "user" | "assistant" | "assistant_tool_call" | "tool" | (string & {});
  content: string;
  timestamp: string;
  /**
   * BE đính kèm ở metadata để render lại đúng UI sau khi tải lịch sử:
   * - `exportable_table`: nút "In" cho bảng báo cáo.
   * - `calendar_events`: mảng sự kiện lịch (kèm event_id) để render lại bảng
   *   lịch + nút "Xem chi tiết". Không có → bảng lịch về markdown, mất nút.
   *   (Xem contract: FE__calendar-chat-history-events__contract__09-07-26.md)
   */
  metadata?: {
    exportable_table?: boolean;
    calendar_events?: unknown;
  } | null;
}

/**
 * GET /api/sessions/{session_id} — lấy messages của một session AI cá nhân.
 * Dùng khi user click vào conversation đã có trên server nhưng chưa có messages trên thiết bị này.
 *
 * Backend scope session cá nhân theo MÃ NHÂN VIÊN, lấy từ JWT Bearer token —
 * không còn gửi header `X-Employee-Code` / `X-User-Id`. Các field `employeeCode`
 * / `userId` trong options được giữ để tương thích chữ ký gọi (không dùng nữa).
 */
export async function fetchPersonalSessionMessages(
  sessionId: string,
  options?: { signal?: AbortSignal; employeeCode?: string; userId?: string },
): Promise<PersonalSessionMessage[]> {
  const response = await fetchWithAuth(
    `${BASE_URL}/api/sessions/${sessionId}`,
    { method: "GET" },
    { signal: options?.signal, timeoutMs: TIMEOUT_MS },
  );
  if (!response.ok) throw new AiApiError(response.status, "http");
  const data = await response.json() as unknown;
  let messages: unknown[] = [];
  if (Array.isArray(data)) {
    messages = data;
  } else if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.messages)) messages = obj.messages;
    else if (Array.isArray(obj.data)) messages = obj.data;
    else if (Array.isArray(obj.items)) messages = obj.items;
    else if (obj.session && typeof obj.session === "object") {
      const sess = obj.session as Record<string, unknown>;
      if (Array.isArray(sess.messages)) messages = sess.messages;
      else if (Array.isArray(sess.data)) messages = sess.data;
    } else if (Array.isArray(obj.history)) messages = obj.history;
  }
  return messages as PersonalSessionMessage[];
}

/**
 * GET /api/personal/sessions — lấy danh sách session AI cá nhân của user.
 * Dùng sau đăng nhập để tải lịch sử chat theo tài khoản thay vì localStorage.
 * BE tự lấy `employee_code` từ JWT Bearer token — không gửi header riêng nữa.
 */
export async function fetchPersonalSessions(
  options?: { signal?: AbortSignal },
): Promise<PersonalSessionsResponse> {
  const response = await fetchWithAuth(
    `${BASE_URL}/api/personal/sessions`,
    { method: "GET" },
    { signal: options?.signal, timeoutMs: TIMEOUT_MS },
  );
  if (!response.ok) {
    throw new AiApiError(response.status, "http");
  }
  const data = await response.json() as unknown;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.sessions)) return { sessions: obj.sessions as PersonalSession[] };
    if (Array.isArray(obj.data)) return { sessions: obj.data as PersonalSession[] };
  }
  if (Array.isArray(data)) return { sessions: data as PersonalSession[] };
  return { sessions: [] };
}
