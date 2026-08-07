import { AI_BASE_URL, aiRequest, AiHttpError, PersonalAiError } from "./personalAiApi";

/**
 * API màn hình bản nháp giao ban (contract mục 2–6).
 *
 * Chỉ gồm các endpoint contract mô tả ĐỦ shape. Bốn endpoint mục 5 (`/{id}`,
 * `/items`, `/items/{id}/sources`, `/tbp-form`) contract chỉ liệt kê đường dẫn
 * mà không mô tả response, nên KHÔNG dựng ở đây — đoán sai shape thì màn hiệu
 * đính render rỗng mà không báo lỗi. Đang chờ
 * `FE__work-report-draft-items-shape__contract__07-08-26.md`.
 */

const DRAFTS_BASE = `${AI_BASE_URL}/api/work-report-drafts`;

/** Một phạm vi còn thiếu quy gán công ty/bộ phận (chỉ để chẩn đoán, contract mục 2). */
export interface UnattributedScope {
  company: string;
  department: string;
  task_count: number;
  in_selected_scope: boolean;
}

/** Kết quả `GET /preflight` (contract mục 2). */
export interface DraftPreflight {
  ready: boolean;
  source_task_count: number;
  /**
   * `ready` bám theo `scope_attribution_complete` — chỉ tính task thiếu
   * `company_id`/`department_id` của CHÍNH phạm vi đang chọn. Dữ liệu hỏng ở
   * phòng khác không khoá nút tạo nữa, chỉ là cảnh báo quản trị.
   */
  scope_attribution_complete: boolean;
  unattributed_task_count_in_scope: number;
  unattributed_task_count_outside_scope: number;
  unattributed_scopes: UnattributedScope[];
  reason: string;
}

/** Kết quả `POST /work-report-drafts` (contract mục 3, trả 202). */
export interface DraftJobCreated {
  job_id: string;
  status: string;
  /**
   * BE dùng lại job đang chạy hoặc bản nháp đã sinh cho cùng phạm vi + kỳ +
   * dữ liệu nguồn + phiên bản pipeline. Hai lần bấm liên tiếp luôn trỏ về cùng
   * `job_id` (ràng buộc ở DB), nên FE không cần tự chống bấm trùng.
   */
  reused: boolean;
  source_task_count: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function pickNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function pickString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeUnattributedScopes(raw: unknown): UnattributedScope[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): UnattributedScope | null => {
      const obj = asRecord(item);
      if (!obj) return null;
      return {
        company: pickString(obj.company),
        department: pickString(obj.department),
        task_count: pickNumber(obj.task_count),
        in_selected_scope: obj.in_selected_scope === true,
      };
    })
    .filter((s): s is UnattributedScope => s !== null);
}

/** Kỳ báo cáo hợp lệ theo contract: 1–31 ngày, `start` không sau `end`. */
export const DRAFT_PERIOD_MAX_DAYS = 31;

export function validateDraftPeriod(
  periodStart: string,
  periodEnd: string,
): { ok: true } | { ok: false; reason: string } {
  if (!periodStart || !periodEnd) return { ok: false, reason: "Chọn đủ ngày bắt đầu và kết thúc." };

  const start = new Date(`${periodStart}T00:00:00`);
  const end = new Date(`${periodEnd}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { ok: false, reason: "Ngày không hợp lệ." };
  }
  if (start > end) return { ok: false, reason: "Ngày bắt đầu phải trước ngày kết thúc." };

  // Trọn cả hai đầu: 01/08 → 01/08 là 1 ngày.
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (days > DRAFT_PERIOD_MAX_DAYS) {
    return { ok: false, reason: `Kỳ báo cáo tối đa ${DRAFT_PERIOD_MAX_DAYS} ngày (đang chọn ${days} ngày).` };
  }
  return { ok: true };
}

function withScope(url: string, scopeToken?: string): string {
  if (!scopeToken) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}${new URLSearchParams({ scope_token: scopeToken }).toString()}`;
}

/**
 * GET /api/work-report-drafts/preflight — kiểm tra trước, KHÔNG tạo job.
 *
 * `ready=false` → khoá nút tạo và hiện `reason`. FE không được suy luận phòng
 * ban từ tên đơn vị trong `unattributed_scopes` (đó thuần tuý là kênh chẩn
 * đoán), cũng không biến `source_task_count` thành tổng toàn bộ công việc.
 */
export async function fetchDraftPreflight(
  params: { periodStart: string; periodEnd: string; scopeToken?: string },
  options?: { signal?: AbortSignal },
): Promise<DraftPreflight> {
  const query = new URLSearchParams({
    period_start: params.periodStart,
    period_end: params.periodEnd,
  });
  const url = withScope(`${DRAFTS_BASE}/preflight?${query.toString()}`, params.scopeToken);

  const response = await aiRequest(url, { signal: options?.signal });
  const payload = (await response.json()) as Record<string, unknown>;

  return {
    ready: payload.ready === true,
    source_task_count: pickNumber(payload.source_task_count),
    scope_attribution_complete: payload.scope_attribution_complete === true,
    unattributed_task_count_in_scope: pickNumber(payload.unattributed_task_count_in_scope),
    unattributed_task_count_outside_scope: pickNumber(
      payload.unattributed_task_count_outside_scope,
    ),
    unattributed_scopes: normalizeUnattributedScopes(payload.unattributed_scopes),
    reason: pickString(payload.reason),
  };
}

/** POST /api/work-report-drafts — tạo job dựng bản nháp (contract mục 3). */
export async function createWorkReportDraftJob(
  params: { periodStart: string; periodEnd: string; scopeToken?: string },
  options?: { signal?: AbortSignal },
): Promise<DraftJobCreated> {
  const response = await aiRequest(DRAFTS_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      period_start: params.periodStart,
      period_end: params.periodEnd,
      ...(params.scopeToken ? { scope_token: params.scopeToken } : {}),
    }),
    signal: options?.signal,
  });

  const payload = (await response.json()) as Record<string, unknown>;
  return {
    job_id: pickString(payload.job_id),
    status: pickString(payload.status) || "queued",
    reused: payload.reused === true,
    source_task_count: pickNumber(payload.source_task_count),
  };
}

/**
 * POST /api/work-report-drafts/{draft_id}/approve (contract mục 6).
 *
 * Chỉ gọi sau khi đã có scope `department_submit`. `409` = bản nháp đã cũ so với
 * nguồn → phải dựng lại draft, KHÔNG cho dùng lại bản cũ.
 */
export async function approveWorkReportDraft(
  draftId: string,
  scopeToken?: string,
  options?: { signal?: AbortSignal },
): Promise<void> {
  await aiRequest(
    withScope(`${DRAFTS_BASE}/${encodeURIComponent(draftId)}/approve`, scopeToken),
    { method: "POST", signal: options?.signal },
  );
}

/**
 * Thông điệp tiếng Việt cho các mã lỗi ở §"Xử lý lỗi" của contract.
 *
 * Ưu tiên thông điệp thật của BE khi có — nó cụ thể hơn câu chung ở đây (vd 409
 * phân biệt "nguồn thay đổi" với "CUID chưa sẵn sàng").
 */
export function describeDraftError(err: unknown): string {
  if (!(err instanceof PersonalAiError)) return "Đã xảy ra lỗi không xác định.";
  if (err.kind === "timeout") return "Yêu cầu quá thời gian. Vui lòng thử lại.";
  if (err.kind === "network") return "Lỗi kết nối. Vui lòng kiểm tra mạng và thử lại.";

  const fromBackend = err instanceof AiHttpError ? err.message?.trim() : "";
  if (fromBackend) return fromBackend;

  switch (err.status) {
    case 401:
      return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
    case 403:
      return "Bạn không có quyền hoặc không thuộc phạm vi thí điểm.";
    case 409:
      return "Nguồn dữ liệu đã thay đổi hoặc bản nháp không còn hợp lệ. Vui lòng tạo lại bản nháp.";
    case 422:
      return "Không có công việc trong kỳ, hoặc kỳ báo cáo không hợp lệ.";
    case 503:
      return "Kho bản nháp chưa sẵn sàng. Vui lòng thử lại sau.";
    default:
      return "Đã xảy ra lỗi. Vui lòng thử lại.";
  }
}
