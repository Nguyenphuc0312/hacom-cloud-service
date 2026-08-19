import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  asCapability,
  asRequiredAction,
  canSubmit,
  canSubmitLevelReport,
  capabilityForTag,
  decideScopePreflight,
  describeScope,
  fetchWorkReportScopes,
  normalizeScopeList,
  normalizeScopeTypes,
  parseScopeRequiredDetail,
  ScopeFeatureDisabledError,
  ScopeFetchError,
  WORK_REPORT_CAPABILITIES,
} from "./workReportScopeApi";
import type { WorkReportScope, WorkReportScopesResponse } from "../types";

let currentToken = "test-token";
vi.mock("../../../services/tokenService", () => ({
  getAccessToken: () => currentToken,
}));

const ensureFreshMock = vi.fn(async () => currentToken);
const refreshSharedMock = vi.fn(async () => currentToken);
vi.mock("../../../services/authRefreshCoordinator", () => ({
  ensureFreshAccessToken: (...args: unknown[]) => ensureFreshMock(...(args as [])),
  refreshAccessTokenShared: (...args: unknown[]) => refreshSharedMock(...(args as [])),
}));

const fetchMock = vi.fn();

function scope(overrides: Partial<WorkReportScope> = {}): WorkReportScope {
  return {
    authorizationId: "auth-1",
    authorizationVersion: 4,
    actions: ["READ", "SUBMIT"],
    scopeType: "DEPARTMENT",
    scopeId: "S1",
    scopeName: "",
    reportingTargetType: "DEPARTMENT",
    reportingTargetId: "T1",
    reportingTargetName: "BCH Công trường Liền kề",
    reportingUnitId: "U1",
    reportingUnitName: "Công ty CP Năng lượng Hacom",
    selectionToken: "tok-1",
    ...overrides,
  };
}

function rawScope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    authorizationId: "auth-1",
    authorizationVersion: 4,
    actions: ["READ", "SUBMIT"],
    scopeType: "DEPARTMENT",
    scopeId: "S1",
    scopeName: "BCH",
    reportingTargetType: "DEPARTMENT",
    reportingTargetId: "T1",
    reportingTargetName: "BCH Công trường Liền kề",
    reportingUnitId: "U1",
    reportingUnitName: "Công ty CP Năng lượng Hacom",
    selectionToken: "tok-1",
    ...overrides,
  };
}

// ── Hàm thuần (không chạm mạng) ────────────────────────────────────────────

describe("capabilityForTag (§2 map thao tác → capability)", () => {
  it("map đúng 3 tag báo cáo cấp, không phân biệt hoa thường/khoảng trắng", () => {
    expect(capabilityForTag("#TBP_baocao")).toBe("department_submit");
    expect(capabilityForTag("  #lddv_baocao ")).toBe("org_unit_submit");
    expect(capabilityForTag("#TCT_tonghop")).toBe("corporation_aggregate");
  });

  it("tag/câu hỏi thường trả undefined (để BE quyết định qua SSE)", () => {
    expect(capabilityForTag("#baocaocv")).toBeUndefined();
    expect(capabilityForTag("tổng hợp phòng ban")).toBeUndefined();
    expect(capabilityForTag("")).toBeUndefined();
  });
});

describe("asCapability / asRequiredAction (whitelist echo từ BE)", () => {
  it("chỉ nhận 6 capability hợp lệ", () => {
    for (const c of WORK_REPORT_CAPABILITIES) expect(asCapability(c)).toBe(c);
    expect(asCapability("department_write")).toBeUndefined();
    expect(asCapability(123)).toBeUndefined();
    expect(asCapability(undefined)).toBeUndefined();
  });

  it("chỉ nhận 3 action hợp lệ", () => {
    expect(asRequiredAction("SUBMIT")).toBe("SUBMIT");
    expect(asRequiredAction("AGGREGATE_CORPORATE_REPORTS")).toBe("AGGREGATE_CORPORATE_REPORTS");
    expect(asRequiredAction("DELETE")).toBeUndefined();
  });
});

describe("normalizeScopeTypes", () => {
  it("lọc bỏ loại lạ, giữ thứ tự; rỗng/không mảng → undefined", () => {
    expect(normalizeScopeTypes(["DEPARTMENT", "X", "ORG_UNIT"])).toEqual([
      "DEPARTMENT",
      "ORG_UNIT",
    ]);
    expect(normalizeScopeTypes(["X"])).toBeUndefined();
    expect(normalizeScopeTypes("DEPARTMENT")).toBeUndefined();
    expect(normalizeScopeTypes(undefined)).toBeUndefined();
  });
});

describe("decideScopePreflight (§2 số scope khớp → hành vi)", () => {
  const res = (
    scopes: WorkReportScope[],
    autoSelected = false,
  ): WorkReportScopesResponse => ({ count: scopes.length, scopes, autoSelected });

  it("0 scope → deny", () => {
    expect(decideScopePreflight(res([]))).toEqual({ kind: "deny" });
  });
  it("autoSelected (§2.4 một phạm vi, BE tự bind) → auto, KHÔNG dropdown", () => {
    // BE trả selectionToken rỗng có chủ đích ở nhánh này.
    expect(decideScopePreflight(res([scope({ selectionToken: "" })], true))).toEqual({
      kind: "auto",
    });
  });
  it("≥2 scope → pick (mở dropdown)", () => {
    const list = [scope(), scope({ authorizationId: "auth-2", selectionToken: "tok-2" })];
    expect(decideScopePreflight(res(list))).toEqual({ kind: "pick", scopes: list });
  });
});

describe("normalizeScopeList (§3 bỏ dòng thiếu token)", () => {
  it("bỏ scope thiếu selectionToken hoặc authorizationId", () => {
    const list = normalizeScopeList([
      rawScope(),
      rawScope({ selectionToken: "" }),
      rawScope({ authorizationId: "" }),
      "not-an-object",
    ]);
    expect(list).toHaveLength(1);
    expect(list[0].selectionToken).toBe("tok-1");
  });

  it("scopeType lạ lùi về DEPARTMENT", () => {
    const [s] = normalizeScopeList([rawScope({ scopeType: "WEIRD" })]);
    expect(s.scopeType).toBe("DEPARTMENT");
  });
});

describe("describeScope (§3 nhãn)", () => {
  it("DEPARTMENT: phòng ban / công ty + actions", () => {
    expect(describeScope(scope({ actions: ["READ", "SUBMIT"] }))).toBe(
      "BCH Công trường Liền kề / Công ty CP Năng lượng Hacom — xem, nộp",
    );
  });
  it("ORG_UNIT: tên đơn vị + actions", () => {
    expect(
      describeScope(
        scope({ scopeType: "ORG_UNIT", actions: ["READ"], reportingTargetName: "Cty Hacom" }),
      ),
    ).toBe("Cty Hacom — xem");
  });
  it("CORPORATION: nhãn cố định bất kể actions", () => {
    expect(describeScope(scope({ scopeType: "CORPORATION", actions: ["READ"] }))).toBe(
      "Toàn TCT — xem, tổng hợp",
    );
  });
});

describe("canSubmitLevelReport (§6 kiểm soát UI nộp)", () => {
  const dept = scope({ scopeType: "DEPARTMENT", actions: ["READ", "SUBMIT"] });
  const orgUnit = scope({ scopeType: "ORG_UNIT", actions: ["READ", "SUBMIT"] });
  const deptReadOnly = scope({ scopeType: "DEPARTMENT", actions: ["READ"] });
  const corp = scope({ scopeType: "CORPORATION", actions: ["AGGREGATE_CORPORATE_REPORTS"] });

  it("#TBP_baocao chỉ nộp được với DEPARTMENT + SUBMIT", () => {
    expect(canSubmitLevelReport("#TBP_baocao", dept)).toBe(true);
    expect(canSubmitLevelReport("#TBP_baocao", orgUnit)).toBe(false); // sai loại
    expect(canSubmitLevelReport("#TBP_baocao", deptReadOnly)).toBe(false); // thiếu SUBMIT
  });

  it("#LDDV_baocao chỉ nộp được với ORG_UNIT + SUBMIT", () => {
    expect(canSubmitLevelReport("#LDDV_baocao", orgUnit)).toBe(true);
    expect(canSubmitLevelReport("#LDDV_baocao", dept)).toBe(false); // sai loại
  });

  it("#TCT_tonghop KHÔNG bao giờ nộp (chỉ tổng hợp)", () => {
    expect(canSubmitLevelReport("#TCT_tonghop", corp)).toBe(false);
    expect(canSubmitLevelReport("#TCT_tonghop", dept)).toBe(false);
  });

  it("chưa chọn scope (null) → không nộp", () => {
    expect(canSubmitLevelReport("#TBP_baocao", null)).toBe(false);
  });

  it("canSubmit: chỉ true khi có SUBMIT trong actions", () => {
    expect(canSubmit(dept)).toBe(true);
    expect(canSubmit(deptReadOnly)).toBe(false);
    expect(canSubmit(corp)).toBe(false);
    expect(canSubmit(null)).toBe(false);
  });
});

// ── fetchWorkReportScopes (chạm mạng — mock fetch) ─────────────────────────

describe("fetchWorkReportScopes (§3 GET /scopes?capability)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    currentToken = "test-token";
    ensureFreshMock.mockClear();
    refreshSharedMock.mockClear();
    refreshSharedMock.mockImplementation(async () => currentToken);
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  // §2.6 — endpoint này hỏi HRM /auth/me mỗi request nên 401 ngay khi access
  // token hết hạn; nó gọi fetch trần nên không đi qua interceptor của axios.
  it("[2.6] làm mới access token TRƯỚC khi gửi", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ count: 0, scopes: [] }), { status: 200 }),
    );
    await fetchWorkReportScopes({ capability: "department_submit" });
    expect(ensureFreshMock).toHaveBeenCalledTimes(1);
  });

  it("[2.6] 401 → làm mới token rồi gửi LẠI, không đẩy user ra đăng nhập", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("", { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ count: 1, scopes: [rawScope()] }), { status: 200 }),
      );
    refreshSharedMock.mockImplementation(async () => {
      currentToken = "fresh-token";
      return currentToken;
    });

    const res = await fetchWorkReportScopes({ capability: "department_submit" });

    expect(res.scopes).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Lượt gửi lại mang token MỚI, không phải token cũ đã hết hạn.
    const retryHeaders = (fetchMock.mock.calls[1][1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(retryHeaders.Authorization).toBe("Bearer fresh-token");
  });

  it("[2.6] 401 mà refresh hỏng (hết phiên thật) → ném ScopeFetchError 401", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 401 }));
    refreshSharedMock.mockRejectedValueOnce(new Error("session gone"));

    await expect(
      fetchWorkReportScopes({ capability: "department_submit" }),
    ).rejects.toMatchObject({ name: "ScopeFetchError", status: 401 });
    // Không gửi lại khi không có token mới — tránh vòng lặp 401.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gửi capability trong query string", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ count: 0, scopes: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await fetchWorkReportScopes({ capability: "department_submit" });
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/work-reports/scopes?capability=department_submit");
  });

  it("luôn kèm capability trong query (BE bắt buộc — không có nhánh trần)", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ count: 0, scopes: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await fetchWorkReportScopes({ capability: "report_read" });
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("?capability=report_read");
  });

  it("echo capability/requiredAction/allowedScopeTypes từ response", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          capability: "department_submit",
          requiredAction: "SUBMIT",
          allowedScopeTypes: ["DEPARTMENT", "junk"],
          count: 1,
          scopes: [rawScope()],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const res = await fetchWorkReportScopes({ capability: "department_submit" });
    expect(res.capability).toBe("department_submit");
    expect(res.requiredAction).toBe("SUBMIT");
    expect(res.allowedScopeTypes).toEqual(["DEPARTMENT"]);
    expect(res.count).toBe(1);
    expect(res.scopes).toHaveLength(1);
  });

  it("[2.4/2.5] echo autoSelected + promptId (một phạm vi → token rỗng có chủ đích)", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          capability: "department_submit",
          count: 1,
          autoSelected: true,
          promptId: "",
          scopes: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const res = await fetchWorkReportScopes({ capability: "department_submit" });
    expect(res.autoSelected).toBe(true);
    expect(res.promptId).toBe("");
    expect(decideScopePreflight(res)).toEqual({ kind: "auto" });
  });

  it("[2.4] BE bản cũ không có autoSelected → lùi về count === 1", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ count: 1, scopes: [rawScope()] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const res = await fetchWorkReportScopes({ capability: "department_submit" });
    expect(res.autoSelected).toBe(true);
  });

  it("404 → ScopeFeatureDisabledError (flag tắt, không phải lỗi quyền §2)", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(fetchWorkReportScopes({ capability: "report_read" })).rejects.toBeInstanceOf(
      ScopeFeatureDisabledError,
    );
  });

  it("422 (capability sai) → ScopeFetchError giữ status, KHÔNG tự đổi capability (§7)", async () => {
    fetchMock.mockResolvedValueOnce(new Response("bad capability", { status: 422 }));
    await expect(
      fetchWorkReportScopes({ capability: "department_submit" }),
    ).rejects.toMatchObject({ name: "ScopeFetchError", status: 422 });
  });

  it("401 → ScopeFetchError status 401", async () => {
    // §2.6: 401 nay được thử lại MỘT lần sau khi làm mới token — vẫn 401 thì mới
    // là lỗi thật. Mock cả hai lượt để kiểm đúng kết cục đó.
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    await expect(
      fetchWorkReportScopes({ capability: "department_read" }),
    ).rejects.toBeInstanceOf(ScopeFetchError);
  });
});

// ── parseScopeRequiredDetail (§2.5 lỗi nộp/xuất mang sẵn dropdown) ──────────

describe("parseScopeRequiredDetail (§2.5)", () => {
  const body = (detail: unknown) => JSON.stringify({ detail });

  it("detail object có scopes → dựng được payload dropdown (promptId, message)", () => {
    const parsed = parseScopeRequiredDetail(
      body({
        reason: "multiple_matching_authorizations",
        message: "Bạn có nhiều phạm vi phù hợp.",
        promptId: " 00c8c7c4120c45499c78a057c11f456c ",
        question: "#TBP_baocao",
        capability: "department_submit",
        requiredAction: "SUBMIT",
        allowedScopeTypes: ["DEPARTMENT", "junk"],
        scopes: [rawScope(), rawScope({ authorizationId: "auth-2", selectionToken: "tok-2" })],
      }),
    );
    expect(parsed).toMatchObject({
      reason: "multiple_matching_authorizations",
      message: "Bạn có nhiều phạm vi phù hợp.",
      promptId: "00c8c7c4120c45499c78a057c11f456c",
      capability: "department_submit",
      requiredAction: "SUBMIT",
      allowedScopeTypes: ["DEPARTMENT"],
    });
    expect(parsed?.scopes).toHaveLength(2);
  });

  it("detail vẫn là CHUỖI (đường lùi BE không ký được token) → null, giữ luồng cũ", () => {
    expect(parseScopeRequiredDetail(body("Bạn có nhiều phạm vi phù hợp."))).toBeNull();
  });

  it("body không phải JSON hoặc detail thiếu scopes → null", () => {
    expect(parseScopeRequiredDetail("<html>502</html>")).toBeNull();
    expect(parseScopeRequiredDetail(body({ reason: "x", scopes: [] }))).toBeNull();
  });
});
