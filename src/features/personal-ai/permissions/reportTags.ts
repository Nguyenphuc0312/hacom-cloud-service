/**
 * Ẩn/hiện tag báo cáo công việc theo quyền `SUBMIT`
 * (spec FE__work-report-tag-visibility-submit__31-07-26).
 *
 * Hai tag cá nhân hiện cho MỌI tài khoản đã đăng nhập. Ba tag cấp quản lý chỉ
 * hiện khi profile có ít nhất một grant báo cáo công việc `ACTIVE` + `ALLOW` +
 * `actions` chứa `SUBMIT`.
 *
 * ⚠️ Đây là quy tắc HIỂN THỊ theo yêu cầu sản phẩm, KHÔNG phải cơ chế bảo mật:
 * BE vẫn là nơi bắt buộc kiểm quyền khi user gửi tag/gọi API. User tự gõ tay
 * `#TBP_baocao` vẫn gửi được — và BE phải từ chối. Đừng nới quy tắc ở BE vì
 * "FE đã ẩn rồi".
 *
 * Không suy `SUBMIT` từ `roles`, chức danh, `permissions` aggregate/read, hay
 * từ việc có `READ`. Thiếu cả hai nguồn dữ liệu → coi như KHÔNG có `SUBMIT`
 * (fail-closed), tránh lộ command quản trị khi profile lỗi/chưa đầy đủ.
 */

export interface ReportTagCommand {
  id: string;
  label: string;
  description: string;
  prompt: string;
}

/** Hiện cho mọi user đã đăng nhập, không phụ thuộc quyền. */
export const PERSONAL_REPORT_TAGS: readonly ReportTagCommand[] = [
  {
    id: "congviectuan",
    label: "#congviectuan",
    description: "Gửi báo cáo công việc tuần",
    prompt: "#congviectuan",
  },
  {
    id: "baocaocongviec",
    label: "#baocaocongviec",
    description: "Gửi báo cáo công việc hằng ngày",
    prompt: "#baocaocongviec",
  },
] as const;

/** Chỉ hiện khi có ít nhất một grant `SUBMIT`. */
export const SUBMIT_REPORT_TAGS: readonly ReportTagCommand[] = [
  {
    id: "TBP_baocao",
    label: "#TBP_baocao",
    description: "Báo cáo bộ phận (TBP) — xem/nộp",
    prompt: "#TBP_baocao",
  },
  {
    id: "LDDV_baocao",
    label: "#LDDV_baocao",
    description: "Báo cáo đơn vị (Giám đốc) — xem/nộp",
    prompt: "#LDDV_baocao",
  },
  {
    id: "TCT_tonghop",
    label: "#TCT_tonghop",
    description: "Tổng hợp toàn tập đoàn (superadmin)",
    prompt: "#TCT_tonghop",
  },
] as const;

/**
 * Hình dạng TỐI THIỂU của profile mà quy tắc này cần. Nhận `unknown`-ish thay vì
 * type chặt vì `authStore.User` không khai báo field báo cáo công việc — chúng
 * đi qua `/auth/me` bằng spread (`normalizeUser`), nên ở runtime có nhưng ở
 * type thì không. Field lạ/thiếu → fail-closed.
 */
interface WorkReportGrantLike {
  status?: unknown;
  effect?: unknown;
  actions?: unknown;
}

interface ScopeCanSubmitLike {
  canSubmit?: unknown;
}

export interface ReportTagProfileLike {
  workReportAuthorizations?: WorkReportGrantLike[] | null;
  workReportCapabilities?: {
    departmentReportScopes?: ScopeCanSubmitLike[] | null;
    unitReportScopes?: ScopeCanSubmitLike[] | null;
    corporationScope?: ScopeCanSubmitLike | null;
  } | null;
}

const isUpper = (value: unknown, expected: string): boolean =>
  typeof value === "string" && value.toUpperCase() === expected;

/**
 * Có ít nhất một grant cho phép NỘP: `ACTIVE` + `ALLOW` + `actions` chứa
 * `SUBMIT` (không phân biệt hoa/thường). `effect` vắng mặt được coi là `ALLOW`
 * (payload cũ chưa có field); `DENY` KHÔNG bao giờ tính là quyền.
 */
export function hasWorkReportSubmit(profile: ReportTagProfileLike): boolean {
  const grants = profile.workReportAuthorizations;
  if (!Array.isArray(grants)) return false;

  return grants.some((grant) => {
    if (!grant || typeof grant !== "object") return false;
    if (!isUpper(grant.status, "ACTIVE")) return false;
    // `effect` vắng mặt (undefined/null) = payload cũ → coi như ALLOW.
    if (grant.effect != null && !isUpper(grant.effect, "ALLOW")) return false;
    return (
      Array.isArray(grant.actions) &&
      grant.actions.some((action) => isUpper(action, "SUBMIT"))
    );
  });
}

/**
 * Dự phòng cho payload cũ CHƯA có `workReportAuthorizations`. Chỉ nhận đúng
 * `canSubmit === true` của scope phòng ban/đơn vị/toàn TCT — không đọc các cờ
 * `canRead`/`canAggregate...` (READ ≠ SUBMIT).
 */
export function fallbackHasWorkReportSubmit(profile: ReportTagProfileLike): boolean {
  const caps = profile.workReportCapabilities;
  if (!caps || typeof caps !== "object") return false;

  const anyScopeSubmits = (scopes: unknown): boolean =>
    Array.isArray(scopes) &&
    scopes.some((scope) => (scope as ScopeCanSubmitLike)?.canSubmit === true);

  return (
    anyScopeSubmits(caps.departmentReportScopes) ||
    anyScopeSubmits(caps.unitReportScopes) ||
    caps.corporationScope?.canSubmit === true
  );
}

/**
 * Danh sách tag báo cáo được phép hiển thị cho profile hiện tại.
 *
 * `null`/`undefined` (chưa tải xong profile, hoặc profile lỗi) → chỉ 2 tag cá
 * nhân. Gọi lại sau khi có profile mới; KHÔNG cache quyền cũ để tránh nháy tag
 * đã bị thu hồi.
 */
export function getVisibleReportTags(
  profile: ReportTagProfileLike | null | undefined,
): readonly ReportTagCommand[] {
  // `workReportAuthorizations` là nguồn ƯU TIÊN: có mặt (dù mảng rỗng) thì nó
  // quyết định, KHÔNG ngó `workReportCapabilities` nữa. Nếu OR hai nguồn, một
  // blob capabilities cũ sẽ hồi sinh grant vừa bị thu hồi — đúng chiều fail-OPEN
  // mà spec cấm. Fallback chỉ dùng cho payload cũ thật sự thiếu field.
  const canSubmit = !profile
    ? false
    : Array.isArray(profile.workReportAuthorizations)
      ? hasWorkReportSubmit(profile)
      : fallbackHasWorkReportSubmit(profile);

  return canSubmit
    ? [...PERSONAL_REPORT_TAGS, ...SUBMIT_REPORT_TAGS]
    : PERSONAL_REPORT_TAGS;
}
