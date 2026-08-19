/**
 * Ẩn/hiện tag báo cáo công việc theo quyền
 * (spec FE__work-report-tag-visibility-submit__31-07-26).
 *
 * Hai tag cá nhân hiện cho MỌI tài khoản đã đăng nhập. Ba tag cấp quản lý chỉ
 * hiện khi tài khoản có quyền ĐÚNG CẤP của chính tag đó:
 *
 *   | Tag             | Điều kiện                                          |
 *   | --------------- | -------------------------------------------------- |
 *   | #TBP_baocao     | grant `DEPARTMENT` + `SUBMIT`                      |
 *   | #LDDV_baocao    | grant `ORG_UNIT` + `SUBMIT`                        |
 *   | #TCT_tonghop    | grant `CORPORATION` + `AGGREGATE_CORPORATE_REPORTS`|
 *
 * ⚠️ LỆCH CÓ CHỦ ĐÍCH so với ví dụ minh hoạ trong spec 31/07. Spec đó chốt luật
 * thô "có ít nhất một SUBMIT ở BẤT KỲ scope nào → hiện cả ba tag", nên một
 * trưởng phòng (chỉ DEPARTMENT+SUBMIT) vẫn nhìn thấy #LDDV_baocao và
 * #TCT_tonghop — vô lý về nghiệp vụ. Chính spec cũng ghi mapping đúng ở mục
 * "Ghi chú về mapping quyền cấp riêng" rồi nói cố ý chưa làm. User chốt làm
 * theo mapping đúng (31/07). Luật thô nằm ở `hasWorkReportSubmit` bên dưới,
 * giữ lại để đối chiếu nếu cần quay về.
 *
 * ⚠️ Đây là quy tắc HIỂN THỊ theo yêu cầu sản phẩm, KHÔNG phải cơ chế bảo mật:
 * BE vẫn là nơi bắt buộc kiểm quyền khi user gửi tag/gọi API. User tự gõ tay
 * `#TBP_baocao` vẫn gửi được — và BE phải từ chối. Đừng nới quy tắc ở BE vì
 * "FE đã ẩn rồi".
 *
 * Không suy quyền từ `roles`, chức danh, hay `permissions` aggregate/read.
 * `READ` KHÔNG đồng nghĩa `SUBMIT`. Thiếu nguồn dữ liệu → coi như KHÔNG có
 * quyền (fail-closed), tránh lộ command quản trị khi profile lỗi/chưa đầy đủ.
 */

export interface ReportTagCommand {
  id: string;
  label: string;
  description: string;
  prompt: string;
  /**
   * Tag này NỘP báo cáo đi (người khác đọc được) chứ không chỉ xem. Chọn nó ở
   * menu `#` phải đưa vào ô nhập để người dùng đính tệp/soát lại rồi mới gửi —
   * KHÔNG gửi thẳng. Đây là chỗ từng khiến báo cáo bay lên TBP do bấm nhầm.
   */
  submits?: true;
}

/** Hiện cho mọi user đã đăng nhập, không phụ thuộc quyền. */
export const PERSONAL_REPORT_TAGS: readonly ReportTagCommand[] = [
  {
    id: "congviectuan",
    label: "#congviectuan",
    description: "Gửi báo cáo công việc tuần",
    prompt: "#congviectuan",
    submits: true,
  },
  {
    id: "baocaocongviec",
    label: "#baocaocongviec",
    description: "Gửi báo cáo công việc hằng ngày",
    prompt: "#baocaocongviec",
  },
] as const;

/** Loại scope + action mà một tag cấp quản lý đòi hỏi. */
interface ScopeRequirement {
  scopeType: "DEPARTMENT" | "ORG_UNIT" | "CORPORATION";
  action: "SUBMIT" | "AGGREGATE_CORPORATE_REPORTS";
}

/**
 * Ba tag cấp quản lý + điều kiện quyền riêng của từng tag.
 *
 * `#TCT_tonghop` đòi `AGGREGATE_CORPORATE_REPORTS` chứ KHÔNG phải `SUBMIT`: tag
 * này chỉ tổng hợp, không nộp gì cả (xem `canSubmitLevelReport` ở
 * `api/workReportScopeApi.ts` — nó luôn trả `false` cho tag này).
 */
export const SUBMIT_REPORT_TAGS: readonly (ReportTagCommand & {
  requires: ScopeRequirement;
})[] = [
  {
    id: "TBP_baocao",
    label: "#TBP_baocao",
    description: "Báo cáo bộ phận (TBP) — xem/nộp",
    prompt: "#TBP_baocao",
    submits: true,
    requires: { scopeType: "DEPARTMENT", action: "SUBMIT" },
  },
  {
    id: "LDDV_baocao",
    label: "#LDDV_baocao",
    description: "Báo cáo đơn vị (Giám đốc) — xem/nộp",
    prompt: "#LDDV_baocao",
    submits: true,
    requires: { scopeType: "ORG_UNIT", action: "SUBMIT" },
  },
  {
    id: "TCT_tonghop",
    label: "#TCT_tonghop",
    description: "Tổng hợp toàn tập đoàn (superadmin)",
    prompt: "#TCT_tonghop",
    requires: { scopeType: "CORPORATION", action: "AGGREGATE_CORPORATE_REPORTS" },
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
  scopeType?: unknown;
}

interface ScopeFlagsLike {
  canSubmit?: unknown;
}

export interface ReportTagProfileLike {
  workReportAuthorizations?: WorkReportGrantLike[] | null;
  workReportCapabilities?: {
    departmentReportScopes?: ScopeFlagsLike[] | null;
    unitReportScopes?: ScopeFlagsLike[] | null;
    corporationScope?: ScopeFlagsLike | null;
    canAggregateCorporateReports?: unknown;
  } | null;
}

const isUpper = (value: unknown, expected: string): boolean =>
  typeof value === "string" && value.toUpperCase() === expected;

/**
 * Grant còn hiệu lực: `ACTIVE` + `ALLOW`. `effect` vắng mặt được coi là `ALLOW`
 * (payload cũ chưa có field); `DENY` KHÔNG bao giờ tính là quyền.
 */
function isEffectiveGrant(grant: WorkReportGrantLike | null | undefined): boolean {
  if (!grant || typeof grant !== "object") return false;
  if (!isUpper(grant.status, "ACTIVE")) return false;
  return grant.effect == null || isUpper(grant.effect, "ALLOW");
}

function grantHasAction(grant: WorkReportGrantLike, action: string): boolean {
  return (
    Array.isArray(grant.actions) &&
    grant.actions.some((value) => isUpper(value, action))
  );
}

/**
 * Luật THÔ của spec 31/07: có ít nhất một grant nộp được ở BẤT KỲ scope nào.
 * Không dùng để dựng danh sách tag nữa (xem chú thích đầu file) — giữ lại vì đó
 * là câu chữ gốc của spec và là đường lùi nếu sản phẩm đổi ý.
 */
export function hasWorkReportSubmit(profile: ReportTagProfileLike): boolean {
  const grants = profile.workReportAuthorizations;
  if (!Array.isArray(grants)) return false;
  return grants.some(
    (grant) => isEffectiveGrant(grant) && grantHasAction(grant, "SUBMIT"),
  );
}

/** Có grant còn hiệu lực khớp ĐÚNG loại scope + action mà một tag đòi hỏi không. */
function hasScopedGrant(
  grants: WorkReportGrantLike[],
  requires: ScopeRequirement,
): boolean {
  return grants.some(
    (grant) =>
      isEffectiveGrant(grant) &&
      isUpper(grant.scopeType, requires.scopeType) &&
      grantHasAction(grant, requires.action),
  );
}

/**
 * Dự phòng cho payload cũ CHƯA có `workReportAuthorizations`, soi theo đúng cấp
 * của từng tag. Chỉ nhận `canSubmit === true` của đúng nhóm scope tương ứng —
 * không đọc `canRead` (READ ≠ SUBMIT).
 *
 * `#TCT_tonghop` lấy cờ `canAggregateCorporateReports` vì đây là tag tổng hợp,
 * không phải tag nộp; `corporationScope.canSubmit` không mang nghĩa đó.
 */
function hasScopedCapability(
  caps: NonNullable<ReportTagProfileLike["workReportCapabilities"]>,
  requires: ScopeRequirement,
): boolean {
  const anyScopeSubmits = (scopes: unknown): boolean =>
    Array.isArray(scopes) &&
    scopes.some((scope) => (scope as ScopeFlagsLike)?.canSubmit === true);

  switch (requires.scopeType) {
    case "DEPARTMENT":
      return anyScopeSubmits(caps.departmentReportScopes);
    case "ORG_UNIT":
      return anyScopeSubmits(caps.unitReportScopes);
    case "CORPORATION":
      return caps.canAggregateCorporateReports === true;
  }
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
  if (!profile) return PERSONAL_REPORT_TAGS;

  // `workReportAuthorizations` là nguồn ƯU TIÊN: có mặt (dù mảng rỗng) thì nó
  // quyết định, KHÔNG ngó `workReportCapabilities` nữa. Nếu OR hai nguồn, một
  // blob capabilities cũ sẽ hồi sinh grant vừa bị thu hồi — đúng chiều fail-OPEN
  // mà spec cấm. Fallback chỉ dùng cho payload cũ thật sự thiếu field.
  const grants = profile.workReportAuthorizations;
  const caps = profile.workReportCapabilities;

  const allows = Array.isArray(grants)
    ? (requires: ScopeRequirement) => hasScopedGrant(grants, requires)
    : caps && typeof caps === "object"
      ? (requires: ScopeRequirement) => hasScopedCapability(caps, requires)
      : () => false;

  const managerTags = SUBMIT_REPORT_TAGS.filter((tag) => allows(tag.requires)).map(
    // Bỏ `requires` khỏi object trả về: consumer chỉ cần shape ReportTagCommand.
    ({ requires: _requires, ...tag }) => tag,
  );

  return managerTags.length > 0
    ? [...PERSONAL_REPORT_TAGS, ...managerTags]
    : PERSONAL_REPORT_TAGS;
}
