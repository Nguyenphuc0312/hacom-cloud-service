import type {
  PersonalDocument,
  PersonalChatRequest,
  PersonalChatResponse,
  UploadDocumentResponse,
  PersonalCitation,
} from "../types";
import { getAccessToken } from "../../../services/tokenService";

const BASE_URL =
  (import.meta.env.VITE_AI_CHAT_BASE_URL as string | undefined)?.trim() ||
  "https://ai-chat.fitora.id.vn";

const DOCS_BASE = `${BASE_URL}/api/chat/personal/documents`;
const WEEKLY_REPORT_FILES_BASE = `${BASE_URL}/api/chat/personal/weekly-report/files`;
const CHAT_URL = `${BASE_URL}/api/chat/personal/stream`;
const TIMEOUT_MS = 60_000;
const UPLOAD_TIMEOUT_MS = 120_000;

function buildAuthHeaders(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}`, "x-api-contract": "3" } : { "x-api-contract": "3" };
}

export class PersonalAiError extends Error {
  readonly status: number;
  readonly kind: "timeout" | "network" | "http";

  constructor(
    status: number,
    kind: "timeout" | "network" | "http" = "http",
    message?: string,
  ) {
    super(message ?? `PersonalAI error [${kind}]: ${status}`);
    this.name = "PersonalAiError";
    this.status = status;
    this.kind = kind;
  }
}

function extractHttpErrorMessage(rawText: string): string | undefined {
  if (!rawText.trim()) return undefined;

  try {
    const payload = JSON.parse(rawText) as Record<string, unknown>;
    const message = payload.detail ?? payload.message ?? payload.error ?? payload.title;
    if (typeof message === "string" && message.trim()) return message.trim();
  } catch {
    return rawText.trim();
  }

  return rawText.trim();
}

function formatHttpErrorMessage(rawText: string, fallbackStatus: number): string {
  const detail = extractHttpErrorMessage(rawText);
  return detail ?? `PersonalAI error [http]: ${fallbackStatus}`;
}

function isJsonResponse(rawText: string): boolean {
  const trimmed = rawText.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function parseHttpErrorMessage(rawText: string): string | undefined {
  if (!rawText.trim()) return undefined;

  if (isJsonResponse(rawText)) {
    try {
      return extractHttpErrorMessage(rawText);
    } catch {
      // Fall through to return the raw text below.
    }
  }

  return rawText.trim();
}

async function aiRequest(
  url: string,
  init: RequestInit = {},
  timeoutMs = TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  const authHeaders = buildAuthHeaders();
  const mergedHeaders = { ...authHeaders, ...(init.headers as Record<string, string> | undefined) };
  try {
    const response = await fetch(url, {
      ...init,
      headers: mergedHeaders,
      signal: init.signal ?? controller.signal,
    });
    if (!response.ok) throw new PersonalAiError(response.status, "http");
    return response;
  } catch (err) {
    if (err instanceof PersonalAiError) throw err;
    if (err instanceof Error && err.name === "AbortError")
      throw new PersonalAiError(0, "timeout");
    throw new PersonalAiError(0, "network");
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function normalizeDocument(raw: unknown): PersonalDocument | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const id = String(obj.id ?? obj.document_id ?? "");
  if (!id) return null;
  return {
    id,
    name: String(obj.name ?? obj.filename ?? obj.file_name ?? "Untitled.pdf"),
    page_count:
      typeof obj.page_count === "number" ? obj.page_count : undefined,
    size_bytes:
      typeof obj.size_bytes === "number"
        ? obj.size_bytes
        : typeof obj.size === "number"
          ? obj.size
          : undefined,
    uploaded_at: String(obj.uploaded_at ?? obj.created_at ?? new Date().toISOString()),
    status: (["uploading", "indexed", "error"].includes(String(obj.status))
      ? obj.status
      : "indexed") as PersonalDocument["status"],
  };
}

function normalizeDocumentList(payload: unknown): PersonalDocument[] {
  if (Array.isArray(payload)) {
    return payload.map(normalizeDocument).filter((d): d is PersonalDocument => d !== null);
  }
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    for (const key of ["documents", "items", "data", "results"]) {
      if (Array.isArray(obj[key])) return normalizeDocumentList(obj[key]);
    }
  }
  return [];
}

/**
 * GET /api/chat/personal/documents
 *
 * BE đọc employee_code + session_id qua query string.
 */
export async function listPersonalDocuments(options?: {
  employeeCode?: string;
  sessionId?: string;
  signal?: AbortSignal;
}): Promise<PersonalDocument[]> {
  const params = new URLSearchParams();
  if (options?.employeeCode) params.set("employee_code", options.employeeCode);
  if (options?.sessionId) params.set("session_id", options.sessionId);
  const qs = params.toString();
  const url = qs ? `${DOCS_BASE}?${qs}` : DOCS_BASE;
  const response = await aiRequest(url, { signal: options?.signal });
  const payload = await response.json();
  return normalizeDocumentList(payload);
}

/** POST /api/chat/personal/documents/upload */
export function uploadPersonalDocument(
  file: File,
  options?: {
    employeeCode?: string;
    sessionId?: string;
    onProgress?: (pct: number) => void;
    signal?: AbortSignal;
  },
): Promise<UploadDocumentResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    // BE đọc employee_code + session_id qua FormData field (cùng giá trị
    // employee_code đang gửi ở chat endpoint).
    const url = `${DOCS_BASE}/upload`;
    const timeoutId = window.setTimeout(() => {
      xhr.abort();
      reject(new PersonalAiError(0, "timeout"));
    }, UPLOAD_TIMEOUT_MS);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      options?.signal?.removeEventListener("abort", handleAbort);
    };
    const handleAbort = () => {
      xhr.abort();
      cleanup();
      reject(new PersonalAiError(0, "timeout"));
    };
    if (options?.signal) {
      if (options.signal.aborted) {
        cleanup();
        reject(new PersonalAiError(0, "timeout"));
        return;
      }
      options.signal.addEventListener("abort", handleAbort);
    }

    const form = new FormData();
    form.append("file", file, file.name);
    if (options?.employeeCode) form.append("employee_code", options.employeeCode);
    if (options?.sessionId) form.append("session_id", options.sessionId);

    xhr.open("POST", url, true);
    xhr.responseType = "text";

    const authHeaders = buildAuthHeaders();
    for (const [key, value] of Object.entries(authHeaders)) {
      xhr.setRequestHeader(key, value);
    }

    if (options?.onProgress) {
      xhr.upload.addEventListener("progress", (evt) => {
        if (evt.lengthComputable && evt.total > 0) {
          options.onProgress!(Math.min(100, Math.round((evt.loaded / evt.total) * 100)));
        }
      });
    }

    xhr.addEventListener("load", () => {
      cleanup();
      const status = xhr.status;
      if (status >= 200 && status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          const doc = normalizeDocument(data);
          if (doc) {
            const resolvedName =
              doc.name && doc.name !== "Untitled.pdf" ? doc.name : file.name;
            resolve({ ...doc, name: resolvedName } as UploadDocumentResponse);
          } else {
            // Backend returned something unexpected — create a minimal response
            resolve({
              id: String(data.id ?? data.document_id ?? crypto.randomUUID()),
              name: file.name,
              uploaded_at: new Date().toISOString(),
              status: "indexed",
            });
          }
        } catch {
          resolve({
            id: crypto.randomUUID(),
            name: file.name,
            uploaded_at: new Date().toISOString(),
            status: "indexed",
          });
        }
      } else {
        reject(
          new PersonalAiError(
            status,
            "http",
            parseHttpErrorMessage(xhr.responseText) ??
              formatHttpErrorMessage(xhr.responseText, status),
          ),
        );
      }
    });

    xhr.addEventListener("error", () => {
      cleanup();
      reject(new PersonalAiError(0, "network"));
    });
    xhr.addEventListener("abort", () => {
      cleanup();
      reject(new PersonalAiError(0, "timeout"));
    });

    xhr.send(form);
  });
}

/** POST /api/chat/personal/documents/source — set active sources */
export async function selectPersonalSources(
  documentIds: string[],
  options?: {
    employeeCode?: string;
    sessionId?: string;
    signal?: AbortSignal;
  },
): Promise<void> {
  const debugToken = getAccessToken();
  // eslint-disable-next-line no-console
  console.debug("[PersonalAI] selectPersonalSources", {
    documentIds,
    hasToken: !!debugToken,
    tokenPrefix: debugToken ? debugToken.slice(0, 30) + "…" : null,
    employeeCode: options?.employeeCode,
  });
  const body: Record<string, unknown> = { document_ids: documentIds };
  if (options?.employeeCode) body.employee_code = options.employeeCode;
  if (options?.sessionId) body.session_id = options.sessionId;
  await aiRequest(`${DOCS_BASE}/source`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: options?.signal,
  });
}

/**
 * DELETE /api/chat/personal/documents/{id}
 *
 * Document xoá là thao tác cấp user (theo employee_code, qua query string),
 * KHÔNG kèm session_id. Nếu kèm session_id thì BE chỉ tìm doc trong phạm vi
 * 1 conversation và sẽ báo "không tìm thấy" khi user đã chuyển conversation.
 */
export async function deletePersonalDocument(
  documentId: string,
  options?: {
    employeeCode?: string;
    signal?: AbortSignal;
  },
): Promise<void> {
  const params = new URLSearchParams();
  if (options?.employeeCode) params.set("employee_code", options.employeeCode);
  const qs = params.toString();
  const url = qs
    ? `${DOCS_BASE}/${documentId}?${qs}`
    : `${DOCS_BASE}/${documentId}`;
  await aiRequest(url, {
    method: "DELETE",
    signal: options?.signal,
  });
}

/**
 * GET /api/chat/personal/weekly-report/files/{fileId}       → download
 * GET /api/chat/personal/weekly-report/files/{fileId}/view  → xem
 *
 * viewTab: tab đã mở sẵn từ click handler (tránh popup bị chặn vì gọi
 * window.open sau await). Với mode="download" không cần truyền.
 */
export async function openWeeklyReportFile(
  fileId: number,
  mode: "view" | "download",
  viewTab?: Window | null,
): Promise<void> {
  const url =
    mode === "view"
      ? `${WEEKLY_REPORT_FILES_BASE}/${fileId}/view`
      : `${WEEKLY_REPORT_FILES_BASE}/${fileId}`;

  const response = await aiRequest(url);
  const contentType = response.headers.get("content-type") ?? "";
  const disposition = response.headers.get("content-disposition") ?? "";
  let filename = `bao-cao-tuan-${fileId}`;
  const nameMatch = disposition.match(/filename[^;=\n]*=["']?([^"';\n]*)["']?/i);
  if (nameMatch?.[1]) filename = decodeURIComponent(nameMatch[1].trim());

  // Đọc body một lần duy nhất
  let resolvedUrl: string | null = null;
  let blob: Blob | null = null;

  if (contentType.includes("application/json") || contentType.includes("text/")) {
    const text = await response.text();
    let candidate = text.trim().replace(/^"|"$/g, "");
    try {
      const parsed = JSON.parse(text) as unknown;
      if (typeof parsed === "string") candidate = parsed;
    } catch { /* not JSON — use raw text */ }

    if (candidate.startsWith("http")) {
      resolvedUrl = candidate;
    } else {
      blob = new Blob([text], { type: contentType || "application/octet-stream" });
    }
  } else {
    blob = await response.blob();
  }

  if (resolvedUrl) {
    if (mode === "view") {
      if (viewTab) viewTab.location.href = resolvedUrl;
      else window.open(resolvedUrl, "_blank");
    } else {
      const a = document.createElement("a");
      a.href = resolvedUrl;
      a.download = filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    return;
  }

  if (!blob) return;

  const objectUrl = URL.createObjectURL(blob);
  if (mode === "view") {
    if (viewTab) viewTab.location.href = objectUrl;
    else window.open(objectUrl, "_blank");
  } else {
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

function normalizeCitation(raw: unknown): PersonalCitation | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  return {
    document_id: String(
      obj.document_id ?? obj.dms_document_id ?? obj.source_file ?? "",
    ),
    document_name: String(
      obj.document_name ?? obj.source_name ?? obj.display_label ?? "Document",
    ),
    page:
      typeof obj.page_number === "number"
        ? obj.page_number
        : typeof obj.page_start === "number"
          ? obj.page_start
          : undefined,
    excerpt: typeof obj.excerpt === "string" ? obj.excerpt : undefined,
    citation_index:
      typeof obj.citation_index === "number" ? obj.citation_index : undefined,
  };
}

/** POST /api/chat/personal/stream — SSE streaming chat */
export async function streamPersonalChat(
  request: PersonalChatRequest,
  options?: {
    onToken?: (token: string) => void;
    onThinking?: (phase: "searching" | "reasoning", text?: string) => void;
    signal?: AbortSignal;
  },
): Promise<PersonalChatResponse> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onAbort = () => controller.abort();
  if (options?.signal) {
    if (options.signal.aborted) {
      window.clearTimeout(timeoutId);
      throw new PersonalAiError(0, "timeout");
    }
    options.signal.addEventListener("abort", onAbort);
  }

  try {
    const response = await fetch(CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...buildAuthHeaders() },
      body: JSON.stringify(request),
      signal: options?.signal ?? controller.signal,
    });

    if (!response.ok) throw new PersonalAiError(response.status, "http");

    const reader = response.body?.getReader();
    if (!reader) throw new Error("Response body is null");

    const decoder = new TextDecoder();
    let accumulated = "";
    let finalResponse: PersonalChatResponse | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      accumulated += chunk;

      // Parse SSE events from chunk
      const events = chunk.split("\n\n");
      for (const event of events) {
        if (!event.trim()) continue;
        const lines = event.split("\n");
        let eventType = "";
        let data = "";

        for (const line of lines) {
          if (line.startsWith("event: "))
            eventType = line.slice(7).trim();
          else if (line.startsWith("data: "))
            data = line.slice(6).trim();
        }

        if (eventType === "token" && options?.onToken) {
          try {
            const parsed = JSON.parse(data);
            options.onToken(
              typeof parsed === "object" && "token" in parsed
                ? String(parsed.token)
                : data,
            );
          } catch {
            options.onToken(data);
          }
        } else if (eventType === "thinking" && options?.onThinking) {
          options.onThinking("reasoning", data);
        } else if (
          (eventType === "searching" || eventType === "retrieving") &&
          options?.onThinking
        ) {
          options.onThinking("searching");
        } else if (eventType === "done") {
          try {
            const parsed = JSON.parse(data);
            finalResponse = {
              session_id: String(parsed.session_id ?? ""),
              answer: String(parsed.answer ?? ""),
              sources: Array.isArray(parsed.sources)
                ? parsed.sources
                    .map(normalizeCitation)
                    .filter((c: PersonalCitation | null): c is PersonalCitation => c !== null)
                : undefined,
            };
          } catch {
            /* malformed done payload — recover below */
          }
        }
      }
    }

    // Fallback: parse from accumulated text
    if (!finalResponse) {
      const match = accumulated.match(/event:\s*done\s*\ndata:\s*(.+)/);
      if (match?.[1]) {
        try {
          const parsed = JSON.parse(match[1]);
          finalResponse = {
            session_id: String(parsed.session_id ?? ""),
            answer: String(parsed.answer ?? ""),
            sources: Array.isArray(parsed.sources)
              ? parsed.sources
                  .map(normalizeCitation)
                  .filter((c: PersonalCitation | null): c is PersonalCitation => c !== null)
              : undefined,
          };
        } catch {
          /* unrecoverable */
        }
      }
    }

    if (!finalResponse) throw new Error("No final response received from AI stream");
    return finalResponse;
  } catch (err) {
    if (err instanceof PersonalAiError) throw err;
    if (err instanceof Error && err.name === "AbortError")
      throw new PersonalAiError(0, "timeout");
    throw new PersonalAiError(0, "network");
  } finally {
    window.clearTimeout(timeoutId);
    options?.signal?.removeEventListener("abort", onAbort);
  }
}
