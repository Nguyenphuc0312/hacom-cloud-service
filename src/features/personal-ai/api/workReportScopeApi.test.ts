import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  asCapability,
  asRequiredAction,
  capabilityForTag,
  decideScopePreflight,
  describeScope,
  fetchWorkReportScopes,
  normalizeScopeList,
  normalizeScopeTypes,
  ScopeFeatureDisabledError,
  ScopeFetchError,
  WORK_REPORT_CAPABILITIES,
} from "./workReportScopeApi";
import type { WorkReportScope } from "../types";

vi.mock("../../../services/tokenService", () => ({
  getAccessToken: () => "test-token",
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
  it("0 scope → deny", () => {
    expect(decideScopePreflight([])).toEqual({ kind: "deny" });
  });
  it("1 scope → auto (tự dùng, không dropdown)", () => {
    const s = scope();
    expect(decideScopePreflight([s])).toEqual({ kind: "auto", scope: s });
  });
  it("≥2 scope → pick (mở dropdown)", () => {
    const list = [scope(), scope({ authorizationId: "auth-2", selectionToken: "tok-2" })];
    expect(decideScopePreflight(list)).toEqual({ kind: "pick", scopes: list });
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

// ── fetchWorkReportScopes (chạm mạng — mock fetch) ─────────────────────────

describe("fetchWorkReportScopes (§3 GET /scopes?capability)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

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

  it("không có capability → gọi /scopes trần (không query)", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ count: 0, scopes: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await fetchWorkReportScopes();
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/work-reports\/scopes$/);
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
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    await expect(fetchWorkReportScopes()).rejects.toBeInstanceOf(ScopeFetchError);
  });
});
