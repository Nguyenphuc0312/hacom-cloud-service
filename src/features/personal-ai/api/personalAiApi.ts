import type {
  PersonalDocument,
  PersonalChatRequest,
  PersonalChatResponse,
  UploadDocumentResponse,
  PersonalCitation,
  LevelReportUploadResponse,
  CalendarEventRow,
} from "../types";
import type {
  WorkReportFormRequest,
  DepartmentSelectionRequest,
} from "../../ai-assistant/types";
import type { WeeklyReportFileItem } from "../../ai-assistant/services/aiChatApi";
import { getAccessToken } from "../../../services/tokenService";
import {
  ensureFreshAccessToken,
  refreshAccessTokenShared,
} from "../../../services/authRefreshCoordinator";
import { resolveSourceUrl } from "../../ai-assistant/utils/sourceUtils";
import {
  appendScopeTokenToUrl,
  withScopeToken,
} from "../stores/workReportScopeStore";
import {
  asCapability,
  asRequiredAction,
  normalizeScopeList,
  normalizeScopeTypes,
  parseScopeRequiredDetail,
} from "./workReportScopeApi";
import type {
  WorkReportAiDraftReady,
  WorkReportAiDraftWaiting,
  WorkReportScopeRequired,
} from "../types";

const BASE_URL =
  (import.meta.env.VITE_AI_CHAT_BASE_URL as string | undefined)?.trim() ||
  "https://ai.hacomholdings.com.vn";

const DOCS_BASE = `${BASE_URL}/api/chat/personal/documents`;
const WEEKLY_REPORT_FILES_BASE = `${BASE_URL}/api/chat/personal/weekly-report/files`;
const CHAT_URL = `${BASE_URL}/api/chat/personal/stream`;
/** Báo cáo theo CẤP (TBP / LĐĐV / TCT) — nộp file + xuất Excel bảng gộp. */
const LEVEL_REPORT_UPLOAD_URL = `${BASE_URL}/api/level-reports/upload`;
const TIMEOUT_MS = 60_000;
const UPLOAD_TIMEOUT_MS = 120_000;

/**
 * Ba tag báo cáo theo CẤP (thay #tongcvtuan/#tongcvthang cũ). Gõ không kèm file
 * → stream markdown như tag thường; gõ KÈM file Excel → nộp qua endpoint riêng
 * `/api/level-reports/upload`. Quyền + phạm vi BE tự suy từ JWT.
 */
export const LEVEL_REPORT_TAGS = ["#TBP_baocao", "#LDDV_baocao", "#TCT_tonghop"] as const;

/**
 * Tên đích của từng tag — dùng cho hộp xác nhận trước khi nộp, để người dùng
 * thấy rõ báo cáo đi ĐÂU (đã có trường hợp lỡ gửi thẳng lên TBP vì UI không nói).
 * `#TCT_tonghop` không nộp được (chỉ tổng hợp) nên không có mặt ở đây.
 */
const LEVEL_REPORT_DESTINATIONS: Record<
  string,
  { destination: string; destinationLong: string }
> = {
  "#tbp_baocao": {
    destination: "báo cáo lên Trưởng bộ phận",
    destinationLong: "lên Trưởng bộ phận (TBP)",
  },
  "#lddv_baocao": {
    destination: "báo cáo lên Lãnh đạo đơn vị",
    destinationLong: "lên Lãnh đạo đơn vị (Giám đốc)",
  },
};

/** Câu hỏi có chứa đúng MỘT tag báo cáo cấp không (dùng để định tuyến upload). */
export function containsLevelReportTag(question: string): boolean {
  const lower = question.toLowerCase();
  return LEVEL_REPORT_TAGS.some((tag) => lower.includes(tag.toLowerCase()));
}

/**
 * Tag NỘP báo cáo cấp trong câu hỏi + nơi báo cáo sẽ được gửi tới. `null` khi
 * câu hỏi không nộp lên cấp nào (không có tag, hoặc chỉ `#TCT_tonghop`).
 */
export function matchLevelReportTag(
  question: string,
): { tag: string; destination: string; destinationLong: string } | null {
  const lower = question.toLowerCase();
  for (const [tag, dest] of Object.entries(LEVEL_REPORT_DESTINATIONS)) {
    if (lower.includes(tag)) return { tag, ...dest };
  }
  return null;
}

function buildAuthHeaders(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}`, "x-api-contract": "3" } : { "x-api-contract": "3" };
}

/**
 * Header auth cho các endpoint AI, có LÀM MỚI access token nếu sắp hết hạn.
 *
 * Các endpoint AI gọi bằng `fetch`/`XHR` trần nên KHÔNG đi qua interceptor
 * refresh của axios (`lib/axios.ts`) như phần còn lại của app. Hai endpoint báo
 * cáo cấp lại hỏi HRM `/auth/me` mỗi request
 * (`CHAT_AUTH_REQUIRE_FRESH_AUTHORIZATION=1`) nên chúng 401 ngay khi token hết
 * hạn, trong khi màn hình vẫn "trông như đang đăng nhập" — đúng triệu chứng mất
 * file lúc nộp. Làm mới ở đây để mọi caller (kể cả multipart) dùng chung một
 * đường như request JSON.
 *
 * Refresh hỏng (hết phiên thật) → vẫn trả header với token cũ: để BE trả 401 và
 * caller xử lý một chỗ, thay vì ném thêm một loại lỗi nữa ở đây.
 */
async function buildFreshAuthHeaders(): Promise<Record<string, string>> {
  try {
    await ensureFreshAccessToken("http_401");
  } catch {
    // ponytail: nuốt lỗi refresh, để 401 của BE là nguồn sự thật duy nhất.
  }
  return buildAuthHeaders();
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

/**
 * Lỗi HTTP giữ nguyên BODY response — `aiRequest` đọc body ngay tại chỗ vì
 * `Response` chỉ đọc được một lần. Nhờ đó caller lấy được lý do thật (§2.5:
 * `detail` object của /level-reports/*) mà không phải gọi lại request.
 */
export class AiHttpError extends PersonalAiError {
  readonly rawBody: string;

  constructor(status: number, rawBody: string) {
    super(status, "http", parseHttpErrorMessage(rawBody));
    this.name = "AiHttpError";
    this.rawBody = rawBody;
  }
}

/**
 * §2.5: lỗi 400/403 của nộp/xuất báo cáo cấp KÈM danh sách phạm vi để dựng
 * dropdown ngay tại chỗ. Caller giữ File trong memory, mở dropdown từ `scope`
 * rồi nộp lại chính lượt đó — không bắt user đính lại tệp, không gọi `/scopes`.
 */
export class LevelReportScopeRequiredError extends PersonalAiError {
  readonly scope: WorkReportScopeRequired & { message?: string };

  constructor(status: number, scope: WorkReportScopeRequired & { message?: string }) {
    super(
      status,
      "http",
      scope.message ?? "Bạn có nhiều phạm vi phù hợp. Vui lòng chọn một phạm vi.",
    );
    this.name = "LevelReportScopeRequiredError";
    this.scope = scope;
  }
}

function extractHttpErrorMessage(rawText: string): string | undefined {
  if (!rawText.trim()) return undefined;

  try {
    const payload = JSON.parse(rawText) as Record<string, unknown>;
    // §2.5: `detail` của /level-reports/* nay có thể là OBJECT — lấy
    // `detail.message` để không in ra "[object Object]".
    const detail = payload.detail;
    const message =
      (detail && typeof detail === "object"
        ? (detail as Record<string, unknown>).message
        : detail) ??
      payload.message ??
      payload.error ??
      payload.title;
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
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
    if (!response.ok) {
      // Đọc body lỗi NGAY (response chỉ đọc được một lần) để caller có lý do
      // thật — §2.5 `detail` object của /level-reports/* nằm trong đây.
      const rawBody = await response.text().catch(() => "");
      throw new AiHttpError(response.status, rawBody);
    }
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
  const obj = asRecord(raw);
  if (!obj) return null;

  const nestedDocument = asRecord(obj.document);
  const selectedIds = Array.isArray(obj.selected_document_ids)
    ? obj.selected_document_ids
    : [];
  const currentDocuments = Array.isArray(obj.current_documents)
    ? obj.current_documents
    : [];
  const firstCurrentDocument = asRecord(currentDocuments[0]);

  const documentId = pickString(
    nestedDocument?.document_id,
    obj.document_id,
    firstCurrentDocument?.document_id,
    selectedIds[0],
    nestedDocument?.id,
    obj.id,
    firstCurrentDocument?.id,
  );
  if (!documentId) return null;

  const documentSource = nestedDocument ?? obj;
  return {
    document_id: documentId,
    id: documentId,
    name: String(
      documentSource.name ??
        documentSource.filename ??
        documentSource.file_name ??
        obj.name ??
        obj.filename ??
        obj.file_name ??
        "Untitled.pdf",
    ),
    page_count:
      typeof documentSource.page_count === "number"
        ? documentSource.page_count
        : typeof obj.page_count === "number"
          ? obj.page_count
          : undefined,
    size_bytes:
      typeof documentSource.size_bytes === "number"
        ? documentSource.size_bytes
        : typeof documentSource.size === "number"
          ? documentSource.size
          : typeof obj.size_bytes === "number"
            ? obj.size_bytes
            : typeof obj.size === "number"
              ? obj.size
              : undefined,
    uploaded_at: String(
      documentSource.uploaded_at ??
        documentSource.created_at ??
        obj.uploaded_at ??
        obj.created_at ??
        new Date().toISOString(),
    ),
    status: (["uploading", "indexed", "error"].includes(
      String(documentSource.status ?? obj.status),
    )
      ? documentSource.status ?? obj.status
      : "indexed") as PersonalDocument["status"],
    original_filename: pickString(
      documentSource.original_filename,
      documentSource.filename,
      obj.original_filename,
      obj.filename,
    ),
    // Ưu tiên tải: download_url (/api/chat/personal/documents/<id>/download) trả
    // đúng file gốc + Content-Disposition: attachment. open_url (/api/source-files/)
    // là fallback tương thích record cũ. reader_url (/api/sources/) CHỈ để xem, không tải.
    download_url: pickString(documentSource.download_url, obj.download_url),
    open_url: pickString(documentSource.open_url, obj.open_url),
    reader_url: pickString(documentSource.reader_url, obj.reader_url),
  };
}

function normalizeUploadedDocumentPayload(
  data: Record<string, unknown>,
  fallbackName: string,
): UploadDocumentResponse | null {
  const doc = normalizeDocument(data);
  if (!doc) return null;
  const resolvedName =
    doc.name && doc.name !== "Untitled.pdf" ? doc.name : fallbackName;
  return { ...doc, name: resolvedName };
}

function invalidUploadResponseError(): PersonalAiError {
  return new PersonalAiError(
    0,
    "http",
    "Upload response did not include a backend document_id.",
  );
}
function normalizeDocumentList(payload: unknown): PersonalDocument[] {
  if (Array.isArray(payload)) {
    return payload.map(normalizeDocument).filter((d): d is PersonalDocument => d !== null);
  }
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    for (const key of ["documents", "items", "data", "results", "current_documents"]) {
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
          const data = JSON.parse(xhr.responseText) as Record<string, unknown>;
          const doc = normalizeUploadedDocumentPayload(data, file.name);
          if (doc) {
            resolve(doc);
          } else {
            reject(invalidUploadResponseError());
          }
        } catch (err) {
          reject(err instanceof PersonalAiError ? err : invalidUploadResponseError());
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

/**
 * POST /api/level-reports/upload — nộp file bản cấp (TBP / LĐĐV).
 *
 * multipart/form-data: `question` (đúng một tag #TBP_baocao|#LDDV_baocao),
 * `file` (.xlsx ≤ 25MB), tùy chọn `week_start`/`week_end` (nộp muộn). Quyền +
 * phạm vi BE tự suy từ JWT — FE KHÔNG gửi. Nộp lại cùng tuần = thay bản cũ (BE
 * tự xử lý). Lỗi: 400 (file/tag hỏng), 403 (sai vai), 413 (>25MB).
 *
 * §2.5: `scopeToken` truyền TƯỜNG MINH (không tự đọc store) — token chỉ hợp lệ
 * cho đúng lượt nộp đã sinh ra nó, caller mới là nơi biết điều đó. 400/403 kèm
 * `detail.scopes` → ném `LevelReportScopeRequiredError` để caller mở dropdown
 * tại chỗ và nộp lại chính lượt đó bằng file còn trong memory.
 *
 * §2.6: 401 KHÔNG được làm mất file. Endpoint này hỏi HRM `/auth/me` mỗi request
 * nên hết hạn token đúng lúc bấm nộp là 401 ngay, dù phần còn lại của app vẫn
 * "trông như đang đăng nhập". Xử lý: làm mới token rồi gửi lại CHÍNH lượt nộp đó
 * với `File` vẫn đang giữ; chỉ khi làm mới thất bại mới để 401 nổi lên cho caller
 * đẩy sang đăng nhập.
 */
export async function uploadLevelReport(
  file: File,
  params: {
    question: string;
    weekStart?: string;
    weekEnd?: string;
    scopeToken?: string;
  },
  options?: { signal?: AbortSignal },
): Promise<LevelReportUploadResponse> {
  const headers = await buildFreshAuthHeaders();
  try {
    return await postLevelReport(file, params, headers, options);
  } catch (err) {
    // Token vừa hết hạn giữa lúc gửi (hoặc HRM thu hồi rồi cấp lại) → làm mới
    // rồi gửi lại đúng lượt này. `file` vẫn trong memory nên user không phải
    // đính lại. Retry ĐÚNG MỘT lần: 401 lần hai là hết phiên thật.
    if (!(err instanceof PersonalAiError) || err.status !== 401) throw err;
    const retryHeaders = await refreshAccessTokenShared("http_401").then(
      () => buildAuthHeaders(),
      () => null,
    );
    if (!retryHeaders) throw err;
    return postLevelReport(file, params, retryHeaders, options);
  }
}

function postLevelReport(
  file: File,
  params: {
    question: string;
    weekStart?: string;
    weekEnd?: string;
    scopeToken?: string;
  },
  authHeaders: Record<string, string>,
  options?: { signal?: AbortSignal },
): Promise<LevelReportUploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
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
    form.append("question", params.question);
    form.append("file", file, file.name);
    if (params.weekStart) form.append("week_start", params.weekStart);
    if (params.weekEnd) form.append("week_end", params.weekEnd);
    // §4: nộp TBP/LĐĐV gửi scope_token dạng multipart field. Token do caller
    // quyết định (§2.5) — không tự lấy từ store, tránh đính token của lượt khác.
    if (params.scopeToken) form.append("scope_token", params.scopeToken);

    xhr.open("POST", LEVEL_REPORT_UPLOAD_URL, true);
    xhr.responseType = "text";
    for (const [key, value] of Object.entries(authHeaders)) {
      xhr.setRequestHeader(key, value);
    }

    xhr.addEventListener("load", () => {
      cleanup();
      const status = xhr.status;
      if (status >= 200 && status < 300) {
        try {
          const data = JSON.parse(xhr.responseText) as Record<string, unknown>;
          resolve({
            ok: data.ok !== false,
            message:
              typeof data.message === "string" && data.message.trim()
                ? data.message.trim()
                : "Đã nhận báo cáo.",
            report: asRecord(data.report) ?? undefined,
          });
        } catch {
          reject(new PersonalAiError(status, "http", "Phản hồi máy chủ không hợp lệ."));
        }
      } else {
        // §2.5: 400 (chưa chọn phạm vi) / 403 (token hỏng mà vẫn nhiều phạm vi)
        // nay kèm sẵn `detail.scopes` → trả lỗi mang payload để caller mở dropdown
        // ngay, không phải gọi lại `/scopes` và bắt user đính lại tệp.
        const scopeDetail =
          status === 400 || status === 403
            ? parseScopeRequiredDetail(xhr.responseText)
            : null;
        reject(
          scopeDetail
            ? new LevelReportScopeRequiredError(status, scopeDetail)
            : new PersonalAiError(
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
  const body: Record<string, unknown> = { document_ids: documentIds };
  if (options?.employeeCode) body.employee_code = options.employeeCode;
  if (options?.sessionId) body.session_id = options.sessionId;

  // BE lấy employee_code từ JWT Bearer token (đã có trong buildAuthHeaders) để
  // biết session nào cần cập nhật — không gửi header X-Employee-Code nữa.
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
 * Chuẩn hoá `download_url` BE trả về URL tải trên host AI, chỉ cho phép đúng path
 * `/api/chat/personal/documents/<id>/download` cùng origin AI (chặn origin lạ).
 * Trả undefined nếu path không khớp hoặc origin khác → caller bỏ qua link này.
 */
function resolvePersonalDownloadUrl(raw?: string): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  const isAllowedPath = (pathname: string) =>
    /^\/api\/chat\/personal\/documents\/[^/]+\/download\/?$/.test(pathname);
  try {
    if (/^https?:\/\//i.test(value)) {
      // URL tuyệt đối: chỉ nhận khi cùng origin với host AI + đúng path.
      const aiOrigin = new URL(BASE_URL).origin;
      const parsed = new URL(value);
      if (parsed.origin !== aiOrigin) return undefined;
      return isAllowedPath(parsed.pathname) ? parsed.href : undefined;
    }
    // URL tương đối: kiểm path rồi gắn BASE_URL để đi qua cùng proxy/host AI.
    const probe = new URL(value, "http://x");
    if (!isAllowedPath(probe.pathname)) return undefined;
    return `${BASE_URL}${probe.pathname}${probe.search}`;
  } catch {
    return undefined;
  }
}

/**
 * Tải file gốc của tài liệu cá nhân.
 *
 * Thứ tự URL bắt buộc (contract §2): `download_url → open_url → báo lỗi`.
 *  - `download_url` (`/api/chat/personal/documents/<id>/download`): ưu tiên chính,
 *    trả đúng file upload gốc + `Content-Disposition: attachment`.
 *  - `open_url` (`/api/source-files/<id>`): fallback tương thích record/backend cũ.
 *  - KHÔNG dùng `reader_url` (`/api/sources/<id>`) — response reader phục vụ
 *    trình đọc/citation (có thể là HTML/nội dung index), tải xuống sẽ ra file sai
 *    định dạng.
 *
 * Fetch qua `aiRequest` để mang Bearer token (anchor thô sẽ 401), rồi blob → chọn
 * nơi lưu / tải xuống. Thiếu cả `download_url` lẫn `open_url`, hoặc 401/403/404 →
 * ném lỗi để caller hiện thông báo chung (không suy đoán tài liệu người khác), và
 * KHÔNG fallback sang reader_url sau khi lỗi.
 */
/** `"saved"` = file đã ghi; `"cancelled"` = user hủy hộp thoại chọn nơi lưu. */
export async function downloadPersonalDocument(doc: {
  download_url?: string;
  open_url?: string;
  reader_url?: string;
  document_id: string;
  original_filename?: string;
  name?: string;
}): Promise<"saved" | "cancelled"> {
  // download_url là nguồn chính (file gốc + attachment); open_url là fallback cho
  // record cũ. resolvePersonalDownloadUrl/resolveSourceUrl chặn origin lạ. reader_url
  // KHÔNG nằm trong chuỗi này — chỉ dùng cho hành động "Xem nguồn".
  const url =
    resolvePersonalDownloadUrl(doc.download_url) ??
    resolveSourceUrl(doc.open_url);
  if (!url) throw new PersonalAiError(0, "http", "PERSONAL_DOCUMENT_DOWNLOAD_URL_MISSING");

  const response = await aiRequest(url, {}, UPLOAD_TIMEOUT_MS);
  const disposition = response.headers.get("content-disposition") ?? "";
  let filename = doc.original_filename || doc.name || "tai-lieu";
  const nameMatch = disposition.match(/filename[^;=\n]*=["']?([^"';\n]*)["']?/i);
  if (nameMatch?.[1]) filename = decodeURIComponent(nameMatch[1].trim());

  const blob = await response.blob();

  // Cho user chọn nơi lưu qua File System Access API (Chromium). Trình duyệt
  // không hỗ trợ (Firefox/Safari) → fallback tải thẳng vào thư mục Downloads.
  // ponytail: dùng API sẵn của trình duyệt thay vì tự dựng dialog.
  const picker = (window as unknown as {
    showSaveFilePicker?: (opts?: unknown) => Promise<{
      createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>;
    }>;
  }).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({ suggestedName: filename });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return "saved";
    } catch (err) {
      // User bấm Cancel trong dialog chọn nơi lưu → không phải lỗi, không toast.
      if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
      // Lỗi khác (quyền ghi…) → rơi xuống fallback tải thẳng bên dưới.
    }
  }

  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  return "saved";
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
  // BE lấy mã nhân viên từ JWT Bearer token — không gửi header X-Employee-Code.
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

/**
 * Nhận diện link xuất Excel bảng gộp báo cáo cấp trong markdown BE trả
 * (#LDDV_baocao / #TCT_tonghop): `/api/level-reports/export?week_start=...`.
 * Trả về URL đầy đủ (đã ghép BASE_URL nếu là path tương đối) để tải kèm auth.
 */
export function parseLevelReportExportHref(href: string | undefined): string | null {
  if (!href) return null;
  const trimmed = href.trim();
  try {
    // Parse against current origin (BASE_URL may be relative in dev — the
    // /ai-api proxy — which new URL() can't use as a base). Then rebuild the
    // fetch URL through BASE_URL so the download honours the same proxy/host as
    // every other AI call instead of hitting the AI host cross-origin.
    const url = new URL(trimmed, window.location.origin);
    if (/\/api\/level-reports\/export\/?$/i.test(url.pathname)) {
      return `${BASE_URL}${url.pathname}${url.search}`;
    }
  } catch {
    /* href không hợp lệ */
  }
  return null;
}

/**
 * GET /api/level-reports/export?week_start=... → tải .xlsx bảng gộp.
 *
 * Cần auth Bearer như mọi API (anchor thường không gửi token → 403), nên phải
 * fetch blob rồi trigger download thủ công.
 */
export async function downloadLevelReportExport(url: string): Promise<void> {
  // §4: xuất báo cáo cấp gửi scope_token qua query, URL-encode qua URLSearchParams.
  let response: Response;
  try {
    response = await aiRequest(appendScopeTokenToUrl(url), {}, UPLOAD_TIMEOUT_MS);
  } catch (err) {
    // §2.5: endpoint này dùng chung cổng phạm vi với upload nên 400/403 cũng là
    // object `detail` kèm `scopes` + `promptId`.
    if (err instanceof AiHttpError && (err.status === 400 || err.status === 403)) {
      const scopeDetail = parseScopeRequiredDetail(err.rawBody);
      if (scopeDetail) throw new LevelReportScopeRequiredError(err.status, scopeDetail);
    }
    throw err;
  }
  const disposition = response.headers.get("content-disposition") ?? "";
  let filename = "bao-cao-tong-hop.xlsx";
  const nameMatch = disposition.match(/filename[^;=\n]*=["']?([^"';\n]*)["']?/i);
  if (nameMatch?.[1]) filename = decodeURIComponent(nameMatch[1].trim());

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

/**
 * Dựng URL tải bản nháp AI từ `export_url` của SSE `work_report_ai_draft_ready`.
 *
 * BE gửi path tương đối (`/api/work-report-drafts/<id>/export.xlsx`); ghép qua
 * `BASE_URL` để đi đúng host AI (dev: proxy `/ai-api`). Chỉ nhận path đúng dạng
 * bản nháp — payload lạ trả null và caller không hiện nút tải.
 *
 * `/api/work-report-drafts/*` đi qua `BASE_URL` như MỌI endpoint chatbot khác,
 * KHÔNG qua `chat.hacomholdings.com.vn`. Team Chatbot từng báo "gateway chưa
 * định tuyến" kèm 404 trên host chat, nhưng host đó proxy toàn bộ `/api/` sang
 * chat-api (NestJS) và chưa bao giờ là cổng vào của API chatbot —
 * `/api/work-reports/*` hiện có cũng 404 y hệt ở đó. FE giữ một đường: host AI.
 */
export function buildWorkReportDraftExportUrl(exportUrl: string | undefined): string | null {
  if (!exportUrl?.trim()) return null;
  try {
    // BASE_URL có thể tương đối ở dev (/ai-api) nên new URL() không dùng làm
    // base được — parse theo origin hiện tại rồi ghép lại như parseLevelReportExportHref.
    const url = new URL(exportUrl.trim(), window.location.origin);
    if (/^\/api\/work-report-drafts\/[^/]+\/export\.xlsx$/i.test(url.pathname)) {
      return `${BASE_URL}${url.pathname}${url.search}`;
    }
  } catch {
    /* export_url không hợp lệ */
  }
  return null;
}

/**
 * URL tải bản nháp dựng TỪ `draft_id`.
 *
 * Contract §"Trình bày chat và xuất Excel" nói `work_report_ai_draft_ready` mang
 * `draft_id`, còn request 06/08 mô tả cùng sự kiện đó mang `export_url`. Nhận cả
 * hai: có `export_url` thì dùng, không thì ghép từ `draft_id`.
 */
export function workReportDraftExportUrlFromId(draftId: string | undefined): string | null {
  const id = draftId?.trim();
  // draft_id đi thẳng vào path nên phải chặn ký tự tách path/query, tránh dựng
  // ra URL trỏ đi chỗ khác từ payload SSE.
  if (!id || !/^[A-Za-z0-9._-]+$/.test(id)) return null;
  return `${BASE_URL}/api/work-report-drafts/${id}/export.xlsx`;
}

/** Trạng thái job dựng bản nháp (contract §4). */
export interface WorkReportDraftJob {
  status: "queued" | "running" | "succeeded" | "failed";
  draft_id?: string;
  error_message?: string;
}

/**
 * GET /api/work-report-drafts/jobs/{job_id} — poll trạng thái dựng bản nháp.
 *
 * Contract §"Không yêu cầu gửi lại tag khi xử lý lâu": một bản nháp có thể cần
 * nhiều lượt LLM, vượt giới hạn chờ của SSE. Nên khi SSE chỉ kịp báo
 * `work_report_ai_draft_waiting` kèm `job_id`, FE phải tự poll đúng job đó —
 * TUYỆT ĐỐI không bắt TBP gõ lại tag để tạo/đọc job.
 */
export async function fetchWorkReportDraftJob(
  jobId: string,
  options?: { signal?: AbortSignal },
): Promise<WorkReportDraftJob> {
  const url = appendScopeTokenToUrl(
    `${BASE_URL}/api/work-report-drafts/jobs/${encodeURIComponent(jobId)}`,
  );
  const response = await aiRequest(url, { signal: options?.signal });
  const payload = (await response.json()) as Record<string, unknown>;
  const status = pickString(payload.status) ?? "";
  return {
    status: (["queued", "running", "succeeded", "failed"].includes(status)
      ? status
      : "running") as WorkReportDraftJob["status"],
    draft_id: pickString(payload.draft_id),
    error_message: pickString(payload.error_message),
  };
}

/**
 * GET /api/work-report-drafts/{draft_id}/export.xlsx → tải bản nháp AI (.xlsx).
 *
 * Endpoint đòi header `Authorization`, nên KHÔNG render `export_url` thành thẻ
 * `<a href>`: dán vào thanh địa chỉ luôn 401 vì trình duyệt không gửi token.
 * Phải fetch blob rồi trigger download thủ công như `downloadLevelReportExport`.
 *
 * Token chỉ đi trong header — không nhét vào URL, không log, không lưu thêm chỗ nào.
 */
export async function downloadWorkReportDraft(url: string): Promise<void> {
  // Nhiều phạm vi DEPARTMENT → gửi kèm `scope_token` như các endpoint khác.
  const response = await aiRequest(appendScopeTokenToUrl(url), {}, UPLOAD_TIMEOUT_MS);

  const disposition = response.headers.get("content-disposition") ?? "";
  let filename = "nhap-giao-ban.xlsx";
  const nameMatch = disposition.match(/filename[^;=\n]*=["']?([^"';\n]*)["']?/i);
  if (nameMatch?.[1]) filename = decodeURIComponent(nameMatch[1].trim());

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

function normalizeWeeklyReportFile(raw: unknown): WeeklyReportFileItem | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const fileIdRaw = obj.file_id ?? obj.id;
  const file_id =
    typeof fileIdRaw === "number"
      ? fileIdRaw
      : Number.parseInt(String(fileIdRaw), 10);
  if (!Number.isFinite(file_id)) return null;
  return {
    ...obj,
    file_id,
    filename:
      typeof obj.filename === "string"
        ? obj.filename
        : typeof obj.original_filename === "string"
          ? obj.original_filename
          : typeof obj.file_name === "string"
            ? obj.file_name
            : undefined,
  };
}

function normalizeWeeklyReportFileList(payload: unknown): WeeklyReportFileItem[] {
  if (Array.isArray(payload)) {
    return payload
      .map(normalizeWeeklyReportFile)
      .filter((f): f is WeeklyReportFileItem => f !== null);
  }
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    for (const key of ["files", "items", "data", "results"]) {
      if (Array.isArray(obj[key])) return normalizeWeeklyReportFileList(obj[key]);
    }
  }
  return [];
}

/**
 * GET /api/chat/personal/weekly-report/files
 *
 * BE scope danh sách theo mã nhân viên lấy từ JWT Bearer token — không gửi
 * header `X-Employee-Code` nữa. Query chỉ nhận week_start / week_end / company /
 * limit. Field `employeeCode` trong options được giữ để tương thích (không dùng).
 */
export async function listPersonalWeeklyReportFiles(options?: {
  employeeCode?: string;
  weekStart?: string;
  weekEnd?: string;
  company?: string;
  limit?: number;
  signal?: AbortSignal;
}): Promise<WeeklyReportFileItem[]> {
  const params = new URLSearchParams();
  if (options?.weekStart) params.set("week_start", options.weekStart);
  if (options?.weekEnd) params.set("week_end", options.weekEnd);
  if (options?.company) params.set("company", options.company);
  params.set("limit", String(Math.min(500, Math.max(1, options?.limit ?? 200))));
  const url = `${WEEKLY_REPORT_FILES_BASE}?${params.toString()}`;
  const response = await aiRequest(url, {
    signal: options?.signal,
  });
  const text = await response.text();
  let payload: unknown = text;
  try {
    payload = JSON.parse(text);
  } catch {
    /* không phải JSON — giữ nguyên text */
  }
  return normalizeWeeklyReportFileList(payload);
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

/**
 * Chuẩn hoá `calendar_events` từ SSE `done`. Chỉ giữ dòng có `event_id` (bắt
 * buộc để mở chi tiết). `detail_action` chỉ nhận khi đúng type — thiếu/hỏng thì
 * bỏ, khi đó bubble không hiện nút chi tiết cho dòng đó (theo spec).
 */
export function normalizeCalendarEvents(raw: unknown): CalendarEventRow[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const rows = raw
    .map((item): CalendarEventRow | null => {
      const obj = asRecord(item);
      const eventId = pickString(obj?.event_id);
      if (!obj || !eventId) return null;

      const action = asRecord(obj.detail_action);
      const actionEventId = pickString(action?.event_id, eventId);
      const detail_action =
        action?.type === "calendar_event_detail" && actionEventId
          ? { type: "calendar_event_detail" as const, event_id: actionEventId }
          : undefined;

      return {
        event_id: eventId,
        title: pickString(obj.title),
        time: pickString(obj.time),
        day: pickString(obj.day),
        event_type: pickString(obj.event_type),
        location: pickString(obj.location),
        chair: pickString(obj.chair),
        detail_action,
      };
    })
    .filter((r): r is CalendarEventRow => r !== null);
  return rows.length > 0 ? rows : undefined;
}

/** POST /api/chat/personal/stream — SSE streaming chat */
export async function streamPersonalChat(
  request: PersonalChatRequest,
  options?: {
    onToken?: (token: string) => void;
    onThinking?: (phase: "searching" | "reasoning", text?: string) => void;
    onFormRequest?: (data: WorkReportFormRequest) => void;
    onSelectionRequest?: (data: DepartmentSelectionRequest) => void;
    /** SSE `work_report_scope_required` — mở widget chọn scope ngay (§3). */
    onScopeRequired?: (data: WorkReportScopeRequired) => void;
    /** SSE `work_report_ai_draft_ready` — hiện nút tải bản nháp AI. */
    onDraftReady?: (data: WorkReportAiDraftReady) => void;
    /**
     * SSE `work_report_ai_draft_waiting` / `work_report_ai_draft_job` — bản nháp
     * còn đang dựng, kèm `job_id` để FE tự poll thay vì bắt gõ lại tag.
     */
    onDraftWaiting?: (data: WorkReportAiDraftWaiting) => void;
    /** SSE `work_report_ai_draft_failed` — dừng poll, hiện lỗi vận hành. */
    onDraftFailed?: (message?: string) => void;
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
      // §4: chat sau khi chọn scope gửi `scope_token` trong JSON body.
      body: JSON.stringify(withScopeToken(request)),
      signal: options?.signal ?? controller.signal,
    });

    if (!response.ok) throw new PersonalAiError(response.status, "http");

    const reader = response.body?.getReader();
    if (!reader) throw new Error("Response body is null");

    const decoder = new TextDecoder();
    let accumulated = "";
    let finalResponse: PersonalChatResponse | null = null;

    // Buffer SSE để ghép event bị cắt ngang giữa 2 chunk mạng. Nếu parse từng
    // chunk độc lập (chunk.split("\n\n")), JSON của selection_request/done có thể
    // bị tách đôi qua 2 lần reader.read() → JSON.parse fail → MẤT event. Đây là
    // nguyên nhân #baocaocv "lúc hiện lúc không" (mất selection_request → rơi vào
    // ReportTextBox rỗng). Chỉ xử lý event đã đủ (kết bằng "\n\n"), giữ phần dư.
    let buffer = "";

    const processEvent = (event: string) => {
      if (!event.trim()) return;
      const lines = event.split("\n");
      let eventType = "";
      let data = "";

      for (const line of lines) {
        if (line.startsWith("event: ")) eventType = line.slice(7).trim();
        else if (line.startsWith("data: ")) data = line.slice(6).trim();
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
      } else if (eventType === "form_request" && options?.onFormRequest) {
        try {
          const parsed = JSON.parse(data) as WorkReportFormRequest;
          if (parsed.form_type === "daily_work_report") {
            options.onFormRequest(parsed);
          }
        } catch { /* malformed payload — ignore */ }
      } else if (eventType === "selection_request" && options?.onSelectionRequest) {
        try {
          const parsed = JSON.parse(data) as DepartmentSelectionRequest;
          if (
            parsed.selection_type === "department_report" ||
            parsed.selection_type === "company_department_report"
          ) {
            options.onSelectionRequest(parsed);
          }
        } catch { /* malformed payload — ignore */ }
      } else if (eventType === "work_report_scope_required" && options?.onScopeRequired) {
        // §3: BE dừng truy vấn, chờ FE gửi lại chính câu hỏi này kèm scope_token.
        try {
          const parsed = JSON.parse(data) as Record<string, unknown>;
          const scopes = normalizeScopeList(parsed.scopes);
          if (scopes.length > 0) {
            options.onScopeRequired({
              reason: String(parsed.reason ?? "multiple_authorizations"),
              // §4 (2.2): khoá nhận diện "một lần hỏi". Thiếu (BE bản 2.1) →
              // chuỗi rỗng, store tự lùi về so chuỗi `question`.
              promptId:
                typeof parsed.promptId === "string" ? parsed.promptId.trim() : "",
              question: String(parsed.question ?? ""),
              scopes,
              // §4: BE cho biết capability/action/loại scope đang yêu cầu.
              capability: asCapability(parsed.capability),
              requiredAction: asRequiredAction(parsed.requiredAction),
              allowedScopeTypes: normalizeScopeTypes(parsed.allowedScopeTypes),
            });
          }
        } catch { /* malformed payload — ignore */ }
      } else if (eventType === "work_report_ai_draft_ready" && options?.onDraftReady) {
        // Bản nháp AI đã dựng xong. Contract nói event mang `draft_id`, request
        // 06/08 nói mang `export_url` — nhận cả hai, ưu tiên `export_url` nếu có
        // và hợp lệ, còn lại ghép từ `draft_id`. Không dựng được URL thì bỏ qua,
        // không hiện nút tải hỏng.
        try {
          const parsed = JSON.parse(data) as Record<string, unknown>;
          const draftId = pickString(parsed.draft_id);
          const exportUrl =
            buildWorkReportDraftExportUrl(pickString(parsed.export_url)) ??
            workReportDraftExportUrlFromId(draftId);
          if (draftId && exportUrl) {
            options.onDraftReady({
              draft_id: draftId,
              export_url: exportUrl,
              export_format: pickString(parsed.export_format),
              read_only: parsed.read_only === true,
            });
          }
        } catch { /* malformed payload — ignore */ }
      } else if (
        (eventType === "work_report_ai_draft_waiting" ||
          // `..._job` phát sau thời gian chờ của SSE. KHÔNG coi là kết thúc:
          // giữ nguyên `job_id` và poll tiếp đúng job đó (contract mục 3).
          eventType === "work_report_ai_draft_job") &&
        options?.onDraftWaiting
      ) {
        try {
          const parsed = JSON.parse(data) as Record<string, unknown>;
          const jobId = pickString(parsed.job_id);
          if (jobId) {
            options.onDraftWaiting({
              job_id: jobId,
              period_start: pickString(parsed.period_start),
              period_end: pickString(parsed.period_end),
            });
          }
        } catch { /* malformed payload — ignore */ }
      } else if (eventType === "work_report_ai_draft_failed" && options?.onDraftFailed) {
        try {
          const parsed = JSON.parse(data) as Record<string, unknown>;
          options.onDraftFailed(pickString(parsed.error_message, parsed.message));
        } catch {
          options.onDraftFailed(undefined);
        }
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
            exportable_table: parsed.exportable_table === true,
            export_id:
              typeof parsed.export_id === "string" && parsed.export_id
                ? parsed.export_id
                : undefined,
            calendar_events: normalizeCalendarEvents(parsed.calendar_events),
          };
        } catch {
          /* malformed done payload — recover below */
        }
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      accumulated += chunk;
      buffer += chunk.replace(/\r\n/g, "\n");

      // Tách các event hoàn chỉnh; phần dư (event chưa kết thúc) giữ lại buffer.
      let sepIndex: number;
      while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
        processEvent(buffer.slice(0, sepIndex));
        buffer = buffer.slice(sepIndex + 2);
      }
    }

    // Flush event cuối nếu server không gửi "\n\n" kết thúc.
    if (buffer.trim()) processEvent(buffer);

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
            exportable_table: parsed.exportable_table === true,
            export_id:
              typeof parsed.export_id === "string" && parsed.export_id
                ? parsed.export_id
                : undefined,
            calendar_events: normalizeCalendarEvents(parsed.calendar_events),
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
