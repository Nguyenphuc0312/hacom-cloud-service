import type {
  WorkReportScope,
  WorkReportScopesResponse,
} from "../types";
import { getAccessToken } from "../../../services/tokenService";

const BASE_URL =
  (import.meta.env.VITE_AI_CHAT_BASE_URL as string | undefined)?.trim() ||
  "https://ai.hacomholdings.com.vn";

const SCOPES_URL = `${BASE_URL}/api/work-reports/scopes`;

/**
 * Flag `WORK_REPORT_MULTI_SCOPE_ENABLED` đang tắt ở BE → endpoint trả 404.
 * Theo §2 đây KHÔNG phải lỗi quyền: FE giữ nguyên luồng cũ (không scope_token,
 * không widget). Caller phân biệt bằng error này thay vì nuốt mọi lỗi.
 */
export class ScopeFeatureDisabledError extends Error {
  constructor() {
    super("WORK_REPORT_MULTI_SCOPE_ENABLED đang tắt — giữ luồng cũ.");
    this.name = "ScopeFeatureDisabledError";
  }
}

/** Lỗi HTTP khi nạp danh sách scope (401 hết phiên, 503 HRM/Auth chưa sẵn sàng). */
export class ScopeFetchError extends Error {
  readonly status: number;

  constructor(status: number, message?: string) {
    super(message ?? `Không tải được danh sách phạm vi (lỗi ${status}).`);
    this.name = "ScopeFetchError";
    this.status = status;
  }
}

function normalizeScope(raw: unknown): WorkReportScope | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === "string" ? v : "");

  // selectionToken là thứ duy nhất bắt buộc — không có thì scope vô dụng vì
  // mọi API §4 đều cần token. Bỏ dòng hỏng thay vì gửi request chắc chắn 400.
  const selectionToken = str(obj.selectionToken).trim();
  const authorizationId = str(obj.authorizationId).trim();
  if (!selectionToken || !authorizationId) return null;

  const scopeType = str(obj.scopeType);
  return {
    authorizationId,
    authorizationVersion:
      typeof obj.authorizationVersion === "number" ? obj.authorizationVersion : 0,
    actions: Array.isArray(obj.actions) ? obj.actions.map(String) : [],
    scopeType: (["CORPORATION", "ORG_UNIT", "DEPARTMENT"].includes(scopeType)
      ? scopeType
      : "DEPARTMENT") as WorkReportScope["scopeType"],
    scopeId: str(obj.scopeId),
    scopeName: str(obj.scopeName),
    reportingTargetType: str(obj.reportingTargetType),
    reportingTargetId: str(obj.reportingTargetId),
    reportingTargetName: str(obj.reportingTargetName),
    reportingUnitId: str(obj.reportingUnitId),
    reportingUnitName: str(obj.reportingUnitName),
    selectionToken,
  };
}

/** Chuẩn hoá mảng `scopes` từ SSE `work_report_scope_required` hoặc API. */
export function normalizeScopeList(raw: unknown): WorkReportScope[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeScope).filter((s): s is WorkReportScope => s !== null);
}

/**
 * GET /api/work-reports/scopes — danh sách authorization của tài khoản.
 *
 * 404 → ném `ScopeFeatureDisabledError` (flag tắt, KHÔNG coi là lỗi quyền §2).
 */
export async function fetchWorkReportScopes(options?: {
  signal?: AbortSignal;
}): Promise<WorkReportScopesResponse> {
  const token = getAccessToken();
  const response = await fetch(SCOPES_URL, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "x-api-contract": "3",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: options?.signal,
  });

  if (response.status === 404) throw new ScopeFeatureDisabledError();
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new ScopeFetchError(response.status, detail.trim() || undefined);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const scopes = normalizeScopeList(payload.scopes);
  return {
    count: typeof payload.count === "number" ? payload.count : scopes.length,
    scopes,
  };
}

/** Nhãn tiếng Việt của từng action (hiển thị kèm tên đơn vị, §3). */
const ACTION_LABELS: Record<string, string> = {
  READ: "xem",
  SUBMIT: "nộp",
  AGGREGATE_CORPORATE_REPORTS: "tổng hợp",
};

function describeActions(actions: string[]): string {
  const labels = actions.map((a) => ACTION_LABELS[a] ?? a.toLowerCase());
  return [...new Set(labels)].join(", ");
}

/**
 * Nhãn hiển thị của một scope — dựng TỪ DỮ LIỆU RESPONSE, không suy từ `roleKey` (§3).
 *
 *  - CORPORATION: "Toàn TCT — chỉ xem/tổng hợp"
 *  - ORG_UNIT:    reportingTargetName + actions
 *  - DEPARTMENT:  reportingTargetName / reportingUnitName + actions
 */
export function describeScope(scope: WorkReportScope): string {
  const actions = describeActions(scope.actions);

  if (scope.scopeType === "CORPORATION") {
    return `Toàn TCT — ${actions || "chỉ xem/tổng hợp"}`;
  }

  // Tên đơn vị có thể rỗng (như ví dụ §3) → lùi về id để nhãn không trống.
  const target = scope.reportingTargetName || scope.reportingTargetId || "Đơn vị";

  if (scope.scopeType === "DEPARTMENT") {
    const unit = scope.reportingUnitName || scope.reportingUnitId;
    const place = unit ? `${target} / ${unit}` : target;
    return actions ? `${place} — ${actions}` : place;
  }

  return actions ? `${target} — ${actions}` : target;
}

/** Scope có cho phép nộp báo cáo cấp không (ẩn nút nộp nếu chỉ aggregate, §6.2). */
export function canSubmit(scope: WorkReportScope | null): boolean {
  return scope?.actions.includes("SUBMIT") ?? false;
}
