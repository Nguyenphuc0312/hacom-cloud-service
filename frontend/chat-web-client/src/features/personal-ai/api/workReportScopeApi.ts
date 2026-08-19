import type {
  WorkReportCapability,
  WorkReportRequiredAction,
  WorkReportScope,
  WorkReportScopeRequired,
  WorkReportScopesResponse,
  WorkReportScopeType,
} from "../types";
import { getAccessToken } from "../../../services/tokenService";
import {
  ensureFreshAccessToken,
  refreshAccessTokenShared,
} from "../../../services/authRefreshCoordinator";

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
 * §2.5: lỗi chọn phạm vi của `/api/level-reports/upload` và `/export` nay là
 * OBJECT `detail` mang đủ dữ liệu dựng dropdown (cùng shape SSE
 * `work_report_scope_required` + `message`), thay vì chuỗi tiếng Việt như trước.
 *
 * Trả null khi `detail` vẫn là chuỗi — đường lùi của BE khi không ký được token
 * (thiếu/ngắn `WORK_REPORT_SCOPE_TOKEN_SECRET`); caller giữ nguyên xử lý cũ.
 */
export function parseScopeRequiredDetail(
  rawBody: string,
): (WorkReportScopeRequired & { message?: string }) | null {
  let detail: unknown;
  try {
    detail = (JSON.parse(rawBody) as Record<string, unknown>)?.detail;
  } catch {
    return null;
  }
  if (!detail || typeof detail !== "object") return null;

  const obj = detail as Record<string, unknown>;
  const scopes = normalizeScopeList(obj.scopes);
  if (scopes.length === 0) return null;

  return {
    reason: typeof obj.reason === "string" ? obj.reason : "",
    promptId: typeof obj.promptId === "string" ? obj.promptId.trim() : undefined,
    // Câu hỏi trong payload đã chuẩn hoá khoảng trắng ở BE — chỉ để hiển thị/log,
    // KHÔNG dùng để khớp token (§2.5 mục 1.4); khớp bằng `promptId`.
    question: typeof obj.question === "string" ? obj.question : "",
    scopes,
    capability: asCapability(obj.capability),
    requiredAction: asRequiredAction(obj.requiredAction),
    allowedScopeTypes: normalizeScopeTypes(obj.allowedScopeTypes),
    message: typeof obj.message === "string" ? obj.message.trim() || undefined : undefined,
  };
}

/**
 * GET /api/work-reports/scopes?capability=... — danh sách authorization KHỚP với
 * một thao tác (§3). `capability` **BẮT BUỘC**: BE bắt buộc query này, thiếu →
 * 422 (xác nhận BE 25/07). Mỗi thao tác user chỉ thấy đúng scope hợp lệ (vd
 * `department_submit` → chỉ DEPARTMENT có SUBMIT). FE không có nhánh gọi trần.
 *
 *  - 404 → `ScopeFeatureDisabledError` (flag đa-scope tắt, KHÔNG phải lỗi quyền §2).
 *  - 422 → capability sai (lỗi tích hợp) → ScopeFetchError, caller KHÔNG tự đổi (§7).
 */
export async function fetchWorkReportScopes(options: {
  capability: WorkReportCapability;
  signal?: AbortSignal;
}): Promise<WorkReportScopesResponse> {
  const url = `${SCOPES_URL}?${new URLSearchParams({ capability: options.capability }).toString()}`;
  const send = (token: string | null) =>
    fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "x-api-contract": "3",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: options?.signal,
    });

  // §2.6: endpoint này hỏi HRM `/auth/me` mỗi request nên 401 ngay khi access
  // token hết hạn, dù phần còn lại của app vẫn "trông như đang đăng nhập". Nó
  // gọi bằng `fetch` trần nên không đi qua interceptor refresh của axios — làm
  // mới ở đây, và thử lại một lần nếu vẫn 401 (token vừa hết hạn giữa chừng).
  await ensureFreshAccessToken("http_401").catch(() => {
    // Hết phiên thật → để 401 bên dưới là nguồn sự thật, không ném thêm loại lỗi.
  });
  let response = await send(getAccessToken());
  if (response.status === 401) {
    const retryToken = await refreshAccessTokenShared("http_401").catch(() => null);
    if (retryToken) response = await send(retryToken);
  }

  if (response.status === 404) throw new ScopeFeatureDisabledError();
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new ScopeFetchError(response.status, detail.trim() || undefined);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const scopes = normalizeScopeList(payload.scopes);
  const count = typeof payload.count === "number" ? payload.count : scopes.length;
  return {
    count,
    scopes,
    // Echo lại từ BE để đối chiếu — ưu tiên giá trị response, lùi về capability đã gửi.
    capability: asCapability(payload.capability) ?? options.capability,
    requiredAction: asRequiredAction(payload.requiredAction),
    allowedScopeTypes: normalizeScopeTypes(payload.allowedScopeTypes),
    // §2.4: BE bản cũ chưa có field này → lùi về `count === 1` (cùng ý nghĩa:
    // một phạm vi thì BE tự bind), giữ tương thích ngược.
    autoSelected:
      typeof payload.autoSelected === "boolean" ? payload.autoSelected : count === 1,
    promptId: typeof payload.promptId === "string" ? payload.promptId.trim() : undefined,
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

/** scopeType hợp lệ cho một tag nộp báo cáo cấp (§2/§6). null = tag không phải nộp. */
const SUBMIT_TAG_SCOPE_TYPE: Record<string, WorkReportScopeType> = {
  "#tbp_baocao": "DEPARTMENT",
  "#lddv_baocao": "ORG_UNIT",
};

/**
 * Được phép NỘP báo cáo cấp cho tag này với scope đang chọn không (§6, kiểm ở UI).
 *
 *  - `#TBP_baocao`  → chỉ khi scope là DEPARTMENT + có SUBMIT.
 *  - `#LDDV_baocao` → chỉ khi scope là ORG_UNIT + có SUBMIT.
 *  - `#TCT_tonghop` → KHÔNG bao giờ nộp (chỉ tổng hợp — AGGREGATE, không SUBMIT).
 *
 * Đây là kiểm soát UI (ẩn/chặn luồng nộp) — pre-flight/BE vẫn kiểm lại (§6).
 * Không có scope đang chọn → false (chưa chọn thì chưa được nộp).
 */
export function canSubmitLevelReport(
  question: string,
  scope: WorkReportScope | null,
): boolean {
  const requiredType = SUBMIT_TAG_SCOPE_TYPE[question.trim().toLowerCase()];
  if (!requiredType) return false; // #TCT_tonghop hoặc tag không phải nộp.
  return !!scope && scope.scopeType === requiredType && canSubmit(scope);
}

/**
 * Quyết định của luồng "user bấm nút thao tác" sau khi có danh sách scope (§2):
 *  - `deny` : 0 scope khớp → không hiện thao tác, báo không có quyền.
 *  - `auto` : BE báo `autoSelected` (đúng MỘT phạm vi sau khi gộp, §2.4) → không
 *    hiện dropdown, gọi thẳng thao tác KHÔNG kèm `scope_token`. `selectionToken`
 *    rỗng ở nhánh này là chủ đích của BE, không phải lỗi.
 *  - `pick` : ≥2 phạm vi → mở dropdown, chờ user chọn.
 */
export type ScopePreflight =
  | { kind: "deny" }
  | { kind: "auto" }
  | { kind: "pick"; scopes: WorkReportScope[] };

export function decideScopePreflight(res: WorkReportScopesResponse): ScopePreflight {
  if (res.autoSelected) return { kind: "auto" };
  if (res.scopes.length === 0) return { kind: "deny" };
  return { kind: "pick", scopes: res.scopes };
}
