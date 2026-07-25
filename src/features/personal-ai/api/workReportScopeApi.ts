import type {
  WorkReportCapability,
  WorkReportRequiredAction,
  WorkReportScope,
  WorkReportScopesResponse,
  WorkReportScopeType,
} from "../types";
import { getAccessToken } from "../../../services/tokenService";

const BASE_URL =
  (import.meta.env.VITE_AI_CHAT_BASE_URL as string | undefined)?.trim() ||
  "https://ai.hacomholdings.com.vn";

const SCOPES_URL = `${BASE_URL}/api/work-reports/scopes`;

/**
 * 6 capability BE cho phép (§3). FE chỉ gửi đúng một trong số này; gửi sai →
 * BE trả 422 và FE KHÔNG tự đổi sang capability khác (§7). Dùng làm whitelist
 * khi echo capability từ response về.
 */
export const WORK_REPORT_CAPABILITIES: readonly WorkReportCapability[] = [
  "department_submit",
  "org_unit_submit",
  "corporation_aggregate",
  "department_read",
  "org_unit_read",
  "report_read",
] as const;

const REQUIRED_ACTIONS: readonly WorkReportRequiredAction[] = [
  "READ",
  "SUBMIT",
  "AGGREGATE_CORPORATE_REPORTS",
] as const;

const SCOPE_TYPES: readonly WorkReportScopeType[] = [
  "CORPORATION",
  "ORG_UNIT",
  "DEPARTMENT",
] as const;

/**
 * Map thao tác user (tag/nút) → capability gọi BE (§2). Chỉ dùng cho luồng user
 * BẤM NÚT thao tác — biết trước ý định nên gọi `/scopes?capability` chủ động.
 * Luồng gõ chat tự do KHÔNG map ở FE: BE quyết định và đẩy SSE với capability.
 */
const TAG_CAPABILITY: Record<string, WorkReportCapability> = {
  "#tbp_baocao": "department_submit",
  "#lddv_baocao": "org_unit_submit",
  "#tct_tonghop": "corporation_aggregate",
};

/** Capability tương ứng một tag báo cáo cấp; undefined nếu không phải tag phạm vi. */
export function capabilityForTag(question: string): WorkReportCapability | undefined {
  const key = question.trim().toLowerCase();
  return TAG_CAPABILITY[key];
}

/** Nhận diện một chuỗi có phải capability hợp lệ (echo từ BE) không. */
export function asCapability(value: unknown): WorkReportCapability | undefined {
  return typeof value === "string" &&
    (WORK_REPORT_CAPABILITIES as readonly string[]).includes(value)
    ? (value as WorkReportCapability)
    : undefined;
}

export function asRequiredAction(value: unknown): WorkReportRequiredAction | undefined {
  return typeof value === "string" &&
    (REQUIRED_ACTIONS as readonly string[]).includes(value)
    ? (value as WorkReportRequiredAction)
    : undefined;
}

/** Lọc mảng `allowedScopeTypes` từ payload, bỏ giá trị lạ. */
export function normalizeScopeTypes(raw: unknown): WorkReportScopeType[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out = raw.filter((v): v is WorkReportScopeType =>
    (SCOPE_TYPES as readonly string[]).includes(v as string),
  );
  return out.length > 0 ? out : undefined;
}

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
 * GET /api/work-reports/scopes?capability=... — danh sách authorization KHỚP với
 * một thao tác (§3). `capability` bắt buộc theo contract v2.0: mỗi thao tác user
 * chỉ thấy đúng scope hợp lệ (vd `department_submit` → chỉ DEPARTMENT có SUBMIT).
 *
 *  - 404 → `ScopeFeatureDisabledError` (flag đa-scope tắt, KHÔNG phải lỗi quyền §2).
 *  - 422 → capability sai (lỗi tích hợp) → ScopeFetchError, caller KHÔNG tự đổi (§7).
 */
export async function fetchWorkReportScopes(options?: {
  capability?: WorkReportCapability;
  signal?: AbortSignal;
}): Promise<WorkReportScopesResponse> {
  const token = getAccessToken();
  const url = options?.capability
    ? `${SCOPES_URL}?${new URLSearchParams({ capability: options.capability }).toString()}`
    : SCOPES_URL;
  const response = await fetch(url, {
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
    // Echo lại từ BE để đối chiếu — ưu tiên giá trị response, lùi về capability đã gửi.
    capability: asCapability(payload.capability) ?? options?.capability,
    requiredAction: asRequiredAction(payload.requiredAction),
    allowedScopeTypes: normalizeScopeTypes(payload.allowedScopeTypes),
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
 *  - CORPORATION: "Toàn TCT — xem, tổng hợp" (nhãn cố định theo §3).
 *  - ORG_UNIT:    reportingTargetName + actions
 *  - DEPARTMENT:  reportingTargetName / reportingUnitName + actions
 */
export function describeScope(scope: WorkReportScope): string {
  const actions = describeActions(scope.actions);

  // §3: CORPORATION dùng nhãn cố định "Toàn TCT — xem, tổng hợp" (không render
  // actions thật) — scope tổng hợp toàn TCT luôn hàm ý xem + tổng hợp.
  if (scope.scopeType === "CORPORATION") {
    return "Toàn TCT — xem, tổng hợp";
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

/**
 * Quyết định của luồng "user bấm nút thao tác" sau khi có danh sách scope (§2):
 *  - `deny`   : 0 scope khớp → không hiện thao tác, báo không có quyền.
 *  - `auto`   : đúng 1 scope → không hiện dropdown, tự dùng scope đó.
 *  - `pick`   : ≥2 scope → mở dropdown, chờ user chọn.
 */
export type ScopePreflight =
  | { kind: "deny" }
  | { kind: "auto"; scope: WorkReportScope }
  | { kind: "pick"; scopes: WorkReportScope[] };

export function decideScopePreflight(scopes: WorkReportScope[]): ScopePreflight {
  if (scopes.length === 0) return { kind: "deny" };
  if (scopes.length === 1) return { kind: "auto", scope: scopes[0] };
  return { kind: "pick", scopes };
}
