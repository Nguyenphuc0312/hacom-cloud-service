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
const TBP = "#TBP_baocao";
const LDDV = "#LDDV_baocao";
const TCT = "#TCT_tonghop";

function grant(overrides: Record<string, unknown> = {}) {
  return {
    status: "ACTIVE",
    effect: "ALLOW",
    scopeType: "DEPARTMENT",
    actions: ["READ", "SUBMIT"],
    ...overrides,
  };
}

describe("cờ `submits` — tag nào KHÔNG được gửi thẳng khi chọn ở menu #", () => {
  /** Tag gửi báo cáo đi; chọn ở menu phải điền vào ô nhập, không gửi ngay. */
  const submitting = (profile: ReportTagProfileLike | null | undefined) =>
    getVisibleReportTags(profile)
      .filter((c) => c.submits)
      .map((c) => c.label);

  it("#congviectuan nộp báo cáo tuần → phải đánh dấu submits", () => {
    expect(submitting(null)).toEqual(["#congviectuan"]);
  });

  it("#baocaocongviec chỉ mở biểu mẫu → KHÔNG đánh dấu submits", () => {
    expect(submitting(null)).not.toContain("#baocaocongviec");
  });

  it("#TBP_baocao và #LDDV_baocao nộp lên cấp trên → phải đánh dấu submits", () => {
    const both = submitting({
      workReportAuthorizations: [
        grant(),
        grant({ scopeType: "ORG_UNIT" }),
      ],
    });
    expect(both).toContain(TBP);
    expect(both).toContain(LDDV);
  });

  it("#TCT_tonghop chỉ tổng hợp → KHÔNG đánh dấu submits", () => {
    const tags = submitting({
      workReportAuthorizations: [
        grant({
          scopeType: "CORPORATION",
          actions: ["AGGREGATE_CORPORATE_REPORTS"],
        }),
      ],
    });
    expect(tags).not.toContain(TCT);
  });
});

describe("getVisibleReportTags — mỗi tag soi ĐÚNG cấp quyền của nó", () => {
  it("DEPARTMENT + SUBMIT → chỉ thêm #TBP_baocao", () => {
    expect(labels({ workReportAuthorizations: [grant()] })).toEqual([
      ...PERSONAL,
      TBP,
    ]);
  });

  it("ORG_UNIT + SUBMIT → chỉ thêm #LDDV_baocao", () => {
    expect(
      labels({ workReportAuthorizations: [grant({ scopeType: "ORG_UNIT" })] }),
    ).toEqual([...PERSONAL, LDDV]);
  });

  it("CORPORATION + AGGREGATE_CORPORATE_REPORTS → chỉ thêm #TCT_tonghop", () => {
    expect(
      labels({
        workReportAuthorizations: [
          grant({
            scopeType: "CORPORATION",
            actions: ["READ", "AGGREGATE_CORPORATE_REPORTS"],
          }),
        ],
      }),
    ).toEqual([...PERSONAL, TCT]);
  });

  it("CORPORATION + SUBMIT (không AGGREGATE) KHÔNG mở #TCT_tonghop — tag này chỉ tổng hợp", () => {
    expect(
      labels({
        workReportAuthorizations: [
          grant({ scopeType: "CORPORATION", actions: ["READ", "SUBMIT"] }),
        ],
      }),
    ).toEqual(PERSONAL);
  });

  it("nhiều grant khác cấp → hiện đúng các tag tương ứng, giữ thứ tự TBP→LDDV→TCT", () => {
    expect(
      labels({
        workReportAuthorizations: [
          grant({ scopeType: "ORG_UNIT" }),
          grant({
            scopeType: "CORPORATION",
            actions: ["AGGREGATE_CORPORATE_REPORTS"],
          }),
          grant({ scopeType: "DEPARTMENT" }),
        ],
      }),
    ).toEqual([...PERSONAL, TBP, LDDV, TCT]);
  });

  it("SUBMIT ở cấp này KHÔNG suy ra quyền ở cấp khác (lý do chọn B)", () => {
    // Trưởng phòng chỉ có DEPARTMENT+SUBMIT thì không được thấy tag đơn vị/TCT.
    const visible = labels({ workReportAuthorizations: [grant()] });
    expect(visible).not.toContain(LDDV);
    expect(visible).not.toContain(TCT);
  });
});

describe("Payload thật (Phòng TC-HC, REVIEWER, DEPARTMENT + READ/SUBMIT)", () => {
  // Copy nguyên từ /auth/me của tài khoản đã báo lỗi "sao lại hiện full".
  const profile: ReportTagProfileLike = {
    workReportAuthorizations: [
      {
        status: "ACTIVE",
        effect: "ALLOW",
        actions: ["READ", "SUBMIT"],
        scopeType: "DEPARTMENT",
      },
    ],
  };

  it("chỉ thấy 2 tag cá nhân + #TBP_baocao", () => {
    expect(labels(profile)).toEqual([...PERSONAL, TBP]);
  });
});

describe("Không có quyền cấp nào → chỉ 2 tag cá nhân", () => {
  it("không có grant", () => {
    expect(labels({ workReportAuthorizations: [] })).toEqual(PERSONAL);
  });

  it("chỉ có grant READ (READ ≠ SUBMIT)", () => {
    expect(labels({ workReportAuthorizations: [grant({ actions: ["READ"] })] })).toEqual(
      PERSONAL,
    );
  });

  it("grant bị thu hồi (INACTIVE hoặc DENY) dù đúng cấp + có SUBMIT", () => {
    expect(
      labels({ workReportAuthorizations: [grant({ status: "INACTIVE" })] }),
    ).toEqual(PERSONAL);
    expect(labels({ workReportAuthorizations: [grant({ effect: "DENY" })] })).toEqual(
      PERSONAL,
    );
  });

  it("chưa tải profile / profile lỗi → không crash", () => {
    expect(labels(null)).toEqual(PERSONAL);
    expect(labels(undefined)).toEqual(PERSONAL);
    expect(labels({})).toEqual(PERSONAL);
    expect(labels({ workReportAuthorizations: null })).toEqual(PERSONAL);
  });

  it("scopeType lạ/thiếu → fail-closed", () => {
    expect(
      labels({ workReportAuthorizations: [grant({ scopeType: undefined })] }),
    ).toEqual(PERSONAL);
    expect(
      labels({ workReportAuthorizations: [grant({ scopeType: "TEAM" })] }),
    ).toEqual(PERSONAL);
  });

  it("dữ liệu rác không làm vỡ", () => {
    expect(
      labels({
        workReportAuthorizations: [
          null,
          undefined,
          "SUBMIT",
          { status: "ACTIVE", scopeType: "DEPARTMENT", actions: "SUBMIT" },
        ] as never,
      }),
    ).toEqual(PERSONAL);
  });
});

describe("So sánh không phân biệt hoa/thường & payload thiếu `effect`", () => {
  it("chữ thường vẫn khớp", () => {
    expect(
      labels({
        workReportAuthorizations: [
          { status: "active", effect: "allow", scopeType: "org_unit", actions: ["submit"] },
        ],
      }),
    ).toEqual([...PERSONAL, LDDV]);
  });

  it("thiếu `effect` (payload cũ) vẫn tính là ALLOW", () => {
    expect(
      labels({
        workReportAuthorizations: [
          { status: "ACTIVE", scopeType: "DEPARTMENT", actions: ["SUBMIT"] },
        ],
      }),
    ).toEqual([...PERSONAL, TBP]);
  });
});

describe("fallback workReportCapabilities (payload cũ chưa có authorizations)", () => {
  it("departmentReportScopes.canSubmit → chỉ #TBP_baocao", () => {
    expect(
      labels({
        workReportCapabilities: { departmentReportScopes: [{ canSubmit: true }] },
      }),
    ).toEqual([...PERSONAL, TBP]);
  });

  it("unitReportScopes.canSubmit → chỉ #LDDV_baocao", () => {
    expect(
      labels({ workReportCapabilities: { unitReportScopes: [{ canSubmit: true }] } }),
    ).toEqual([...PERSONAL, LDDV]);
  });

  it("canAggregateCorporateReports → chỉ #TCT_tonghop", () => {
    expect(
      labels({ workReportCapabilities: { canAggregateCorporateReports: true } }),
    ).toEqual([...PERSONAL, TCT]);
  });

  it("corporationScope.canSubmit KHÔNG mở #TCT_tonghop (cờ sai ngữ nghĩa)", () => {
    expect(
      labels({ workReportCapabilities: { corporationScope: { canSubmit: true } } }),
    ).toEqual(PERSONAL);
  });

  it("chỉ canRead (canSubmit false) → chỉ 2 tag cá nhân", () => {
    expect(
      labels({
        workReportCapabilities: {
          departmentReportScopes: [{ canSubmit: false }],
          unitReportScopes: [],
          canAggregateCorporateReports: false,
        },
      }),
    ).toEqual(PERSONAL);
  });

  it("có `workReportAuthorizations` thì nó QUYẾT ĐỊNH — capabilities cũ không cứu grant đã thu hồi", () => {
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
        workReportCapabilities: { canAggregateCorporateReports: true },
      }),
    ).toEqual(PERSONAL);
  });
});

describe("hasWorkReportSubmit — luật THÔ của spec, giữ làm đường lùi", () => {
  it("vẫn true khi có SUBMIT ở bất kỳ scope nào", () => {
    expect(hasWorkReportSubmit({ workReportAuthorizations: [grant()] })).toBe(true);
  });

  it("false khi grant bị thu hồi hoặc chỉ có READ", () => {
    expect(
      hasWorkReportSubmit({ workReportAuthorizations: [grant({ effect: "DENY" })] }),
    ).toBe(false);
    expect(
      hasWorkReportSubmit({ workReportAuthorizations: [grant({ actions: ["READ"] })] }),
    ).toBe(false);
  });
});
