import { describe, it, expect } from "vitest";
import {
  getVisibleReportTags,
  hasWorkReportSubmit,
  type ReportTagProfileLike,
} from "./reportTags";

/** Nhãn tag đang hiển thị — thứ tự đúng như spec (2 cá nhân trước). */
const labels = (profile: ReportTagProfileLike | null | undefined): string[] =>
  getVisibleReportTags(profile).map((c) => c.label);

const PERSONAL = ["#congviectuan", "#baocaocongviec"];
const ALL_FIVE = [...PERSONAL, "#TBP_baocao", "#LDDV_baocao", "#TCT_tonghop"];

function grant(overrides: Record<string, unknown> = {}) {
  return {
    status: "ACTIVE",
    effect: "ALLOW",
    actions: ["READ", "SUBMIT"],
    ...overrides,
  };
}

describe("getVisibleReportTags — bảng kiểm thử chấp nhận (spec 31/07)", () => {
  it("nhân viên thường (không có grant) → chỉ 2 tag cá nhân", () => {
    expect(labels({ workReportAuthorizations: [] })).toEqual(PERSONAL);
  });

  it("chỉ có grant READ → chỉ 2 tag cá nhân (READ ≠ SUBMIT)", () => {
    expect(labels({ workReportAuthorizations: [grant({ actions: ["READ"] })] })).toEqual(
      PERSONAL,
    );
  });

  it("grant SUBMIT duy nhất → cả 5 tag", () => {
    expect(
      labels({ workReportAuthorizations: [grant({ actions: ["SUBMIT"] })] }),
    ).toEqual(ALL_FIVE);
  });

  it("grant READ + SUBMIT → cả 5 tag", () => {
    expect(labels({ workReportAuthorizations: [grant()] })).toEqual(ALL_FIVE);
  });

  it("grant bị thu hồi (INACTIVE hoặc DENY) → chỉ 2 tag cá nhân", () => {
    expect(
      labels({ workReportAuthorizations: [grant({ status: "INACTIVE" })] }),
    ).toEqual(PERSONAL);
    expect(labels({ workReportAuthorizations: [grant({ effect: "DENY" })] })).toEqual(
      PERSONAL,
    );
  });

  it("chưa tải profile / profile lỗi → chỉ 2 tag cá nhân, không crash", () => {
    expect(labels(null)).toEqual(PERSONAL);
    expect(labels(undefined)).toEqual(PERSONAL);
    expect(labels({})).toEqual(PERSONAL);
    expect(labels({ workReportAuthorizations: null })).toEqual(PERSONAL);
  });

  it("AGGREGATE_CORPORATE_REPORTS mà không SUBMIT → chỉ 2 tag cá nhân", () => {
    expect(
      labels({
        workReportAuthorizations: [
          grant({ actions: ["READ", "AGGREGATE_CORPORATE_REPORTS"] }),
        ],
      }),
    ).toEqual(PERSONAL);
  });
});

describe("hasWorkReportSubmit — chi tiết quy tắc", () => {
  it("so sánh không phân biệt hoa/thường", () => {
    expect(
      hasWorkReportSubmit({
        workReportAuthorizations: [
          { status: "active", effect: "allow", actions: ["submit"] },
        ],
      }),
    ).toBe(true);
  });

  it("thiếu `effect` (payload cũ) vẫn tính là ALLOW", () => {
    expect(
      hasWorkReportSubmit({
        workReportAuthorizations: [{ status: "ACTIVE", actions: ["SUBMIT"] }],
      }),
    ).toBe(true);
  });

  it("chỉ cần MỘT grant hợp lệ trong nhiều grant", () => {
    expect(
      hasWorkReportSubmit({
        workReportAuthorizations: [
          grant({ actions: ["READ"] }),
          grant({ status: "INACTIVE" }),
          grant({ actions: ["SUBMIT"] }),
        ],
      }),
    ).toBe(true);
  });

  it("dữ liệu rác không làm vỡ (fail-closed)", () => {
    expect(
      hasWorkReportSubmit({
        workReportAuthorizations: [
          null,
          undefined,
          "SUBMIT",
          { status: "ACTIVE", actions: "SUBMIT" },
        ] as never,
      }),
    ).toBe(false);
  });
});

describe("fallback workReportCapabilities (payload cũ chưa có authorizations)", () => {
  it("departmentReportScopes.canSubmit → hiện cả 5 tag", () => {
    expect(
      labels({
        workReportCapabilities: {
          departmentReportScopes: [{ canSubmit: true }],
        },
      }),
    ).toEqual(ALL_FIVE);
  });

  it("unitReportScopes / corporationScope canSubmit → hiện cả 5 tag", () => {
    expect(
      labels({ workReportCapabilities: { unitReportScopes: [{ canSubmit: true }] } }),
    ).toEqual(ALL_FIVE);
    expect(
      labels({ workReportCapabilities: { corporationScope: { canSubmit: true } } }),
    ).toEqual(ALL_FIVE);
  });

  it("chỉ canRead (không canSubmit) → chỉ 2 tag cá nhân", () => {
    expect(
      labels({
        workReportCapabilities: {
          departmentReportScopes: [{ canSubmit: false }],
          unitReportScopes: [],
          corporationScope: { canSubmit: false },
        },
      }),
    ).toEqual(PERSONAL);
  });

  it("có `workReportAuthorizations` thì nó QUYẾT ĐỊNH — capabilities cũ không cứu được grant đã thu hồi", () => {
    expect(
      labels({
        workReportAuthorizations: [grant({ status: "INACTIVE" })],
        workReportCapabilities: { departmentReportScopes: [{ canSubmit: true }] },
      }),
    ).toEqual(PERSONAL);
  });

  it("mảng authorizations RỖNG cũng là câu trả lời (không rơi về fallback)", () => {
    expect(
      labels({
        workReportAuthorizations: [],
        workReportCapabilities: { corporationScope: { canSubmit: true } },
      }),
    ).toEqual(PERSONAL);
  });
});
