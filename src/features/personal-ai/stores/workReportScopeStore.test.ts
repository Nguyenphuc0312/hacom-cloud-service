import { beforeEach, describe, expect, it } from "vitest";
import {
  appendScopeToken,
  appendScopeTokenToUrl,
  getScopeToken,
  handleScopeErrorStatus,
  isTokenValidFor,
  useWorkReportScopeStore,
  withScopeToken,
} from "./workReportScopeStore";
import { canSubmit, describeScope } from "../api/workReportScopeApi";
import type { WorkReportScope } from "../types";

function scope(overrides: Partial<WorkReportScope> = {}): WorkReportScope {
  return {
    authorizationId: "auth-1",
    authorizationVersion: 6,
    actions: ["READ"],
    scopeType: "DEPARTMENT",
    scopeId: "S1",
    scopeName: "",
    reportingTargetType: "ORG_UNIT",
    reportingTargetId: "T1",
    reportingTargetName: "Công ty CP Đầu tư và Xây lắp Bình Sơn",
    reportingUnitId: "U1",
    reportingUnitName: "BCH Công trường Liền kề",
    selectionToken: "token-1",
    ...overrides,
  };
}

beforeEach(() => {
  useWorkReportScopeStore.getState().reset();
});

describe("chọn scope", () => {
  it("count == 1 thì pre-select + giữ token nhưng VẪN mở dropdown để user xác nhận", () => {
    useWorkReportScopeStore.getState().setScopes([scope()]);
    const state = useWorkReportScopeStore.getState();
    // UX chốt lại: luôn hiển thị dropdown kể cả 1 lựa chọn (đã chọn sẵn).
    expect(state.isPicking).toBe(true);
    expect(state.selected?.selectionToken).toBe("token-1");
    expect(getScopeToken()).toBe("token-1");
  });

  it("count > 1 thì bắt buộc chọn, chưa chọn thì chưa có token", () => {
    useWorkReportScopeStore
      .getState()
      .setScopes([scope(), scope({ authorizationId: "auth-2", selectionToken: "token-2" })]);
    expect(useWorkReportScopeStore.getState().isPicking).toBe(true);
    expect(getScopeToken()).toBeUndefined();
  });

  it("giữ capability qua setScopes/requirePick để nạp lại đúng khi 403 (§7)", () => {
    const store = useWorkReportScopeStore.getState();
    store.setScopes([scope()], "department_submit");
    expect(useWorkReportScopeStore.getState().capability).toBe("department_submit");
    // 403 xóa selection + scopes nhưng GIỮ capability để selector nạp lại đúng.
    store.clearSelection();
    expect(useWorkReportScopeStore.getState().capability).toBe("department_submit");
    // reset mới xóa capability (đổi phiên/thao tác).
    store.reset();
    expect(useWorkReportScopeStore.getState().capability).toBeNull();
  });

  it("đổi scope thì bump dataEpoch để bỏ dữ liệu scope cũ (§5)", () => {
    const store = useWorkReportScopeStore.getState();
    store.setScopes([scope(), scope({ authorizationId: "auth-2", selectionToken: "token-2" })]);
    store.select(scope());
    const epochAfterFirst = useWorkReportScopeStore.getState().dataEpoch;

    useWorkReportScopeStore
      .getState()
      .select(scope({ authorizationId: "auth-2", selectionToken: "token-2" }));
    expect(useWorkReportScopeStore.getState().dataEpoch).toBe(epochAfterFirst + 1);
  });
});

describe("ensureScopeKey — khóa authUserId + capability (§7)", () => {
  it("cùng user + capability → giữ nguyên lựa chọn, trả false", () => {
    const store = useWorkReportScopeStore.getState();
    store.ensureScopeKey("u1", "department_submit");
    store.setScopes([scope()], "department_submit");
    const changed = store.ensureScopeKey("u1", "department_submit");
    expect(changed).toBe(false);
    expect(getScopeToken()).toBe("token-1");
  });

  it("đổi capability → xóa token cũ, KHÔNG tái dùng cho thao tác khác", () => {
    const store = useWorkReportScopeStore.getState();
    store.ensureScopeKey("u1", "department_submit");
    store.setScopes([scope()], "department_submit");
    expect(getScopeToken()).toBe("token-1");

    const changed = store.ensureScopeKey("u1", "org_unit_submit");
    expect(changed).toBe(true);
    const state = useWorkReportScopeStore.getState();
    expect(state.selected).toBeNull();
    expect(state.scopes).toBeNull();
    expect(state.capability).toBe("org_unit_submit");
    expect(getScopeToken()).toBeUndefined();
  });

  it("đổi authUserId (đăng nhập tài khoản khác) → xóa token cũ", () => {
    const store = useWorkReportScopeStore.getState();
    store.ensureScopeKey("u1", "department_submit");
    store.setScopes([scope()], "department_submit");

    const changed = store.ensureScopeKey("u2", "department_submit");
    expect(changed).toBe(true);
    expect(getScopeToken()).toBeUndefined();
  });
});

describe("token dùng đúng 1 lần cho đúng câu hỏi (§4 — bản 2.1)", () => {
  const scopeA = scope({ authorizationId: "auth-A", selectionToken: "token-A" });
  const scopeB = scope({ authorizationId: "auth-B", selectionToken: "token-B" });

  it("token chỉ hợp lệ cho ĐÚNG câu hỏi đã sinh ra dropdown", () => {
    const store = useWorkReportScopeStore.getState();
    store.setScopes([scopeA, scopeB], "report_read");
    store.requirePick("tổng hợp báo cáo của mọi người trong phòng ban", "report_read");
    store.select(scopeA);

    expect(isTokenValidFor("tổng hợp báo cáo của mọi người trong phòng ban")).toBe(true);
    // Khoảng trắng thừa vẫn là cùng câu hỏi (FE trim trước khi gửi).
    expect(isTokenValidFor("  tổng hợp báo cáo của mọi người trong phòng ban  ")).toBe(true);
    // Câu hỏi khác — kể cả cùng chủ đề — KHÔNG được dùng lại token.
    expect(isTokenValidFor("tổng hợp báo cáo tuần này của phòng ban")).toBe(false);
  });

  it("chưa chọn scope thì không câu hỏi nào hợp lệ", () => {
    const store = useWorkReportScopeStore.getState();
    store.setScopes([scopeA, scopeB], "report_read");
    store.requirePick("câu hỏi chung chung", "report_read");
    expect(isTokenValidFor("câu hỏi chung chung")).toBe(false);
  });

  it("releaseScopeToken xóa token + danh sách nhưng KHÔNG mở widget", () => {
    const store = useWorkReportScopeStore.getState();
    store.setScopes([scopeA, scopeB], "report_read");
    store.requirePick("câu hỏi 1", "report_read");
    store.select(scopeA);
    expect(getScopeToken()).toBe("token-A");

    useWorkReportScopeStore.getState().releaseScopeToken();
    const state = useWorkReportScopeStore.getState();
    expect(getScopeToken()).toBeUndefined();
    expect(state.scopes).toBeNull();
    expect(state.tokenQuestion).toBeNull();
    // Nhả token là kết thúc bình thường, không phải lỗi → không tự bật dropdown.
    expect(state.isPicking).toBe(false);
    // Dữ liệu/bảng của scope cũ không còn hợp lệ.
    expect(state.dataEpoch).toBeGreaterThan(0);
  });

  it("acceptance §9.8: lượt 2 chọn scope B thì gửi token B, không phải token A", () => {
    const store = useWorkReportScopeStore.getState();

    // Lượt 1: câu hỏi chung chung → dropdown → chọn scope A → gửi kèm token A.
    store.setScopes([scopeA, scopeB], "report_read");
    store.requirePick("tổng hợp báo cáo phòng ban", "report_read");
    store.select(scopeA);
    expect(withScopeToken({ question: "tổng hợp báo cáo phòng ban" })).toMatchObject({
      scope_token: "token-A",
    });

    // Lượt 2: câu hỏi chung chung KHÁC → token cũ không còn hợp lệ → FE nhả token
    // và gửi KHÔNG kèm scope_token để BE hỏi lại phạm vi.
    const nextQuestion = "tổng hợp báo cáo của mọi người";
    expect(isTokenValidFor(nextQuestion)).toBe(false);
    useWorkReportScopeStore.getState().releaseScopeToken();
    expect(withScopeToken({ question: nextQuestion })).toEqual({ question: nextQuestion });

    // BE trả `work_report_scope_required` lần nữa → lần này user chọn scope B.
    const store2 = useWorkReportScopeStore.getState();
    store2.setScopes([scopeA, scopeB], "report_read");
    store2.requirePick(nextQuestion, "report_read");
    store2.select(scopeB);
    expect(isTokenValidFor(nextQuestion)).toBe(true);
    expect(withScopeToken({ question: nextQuestion })).toMatchObject({
      scope_token: "token-B",
    });
  });

  it("ensureScopeKey / clearSelection / reset đều xóa tokenQuestion", () => {
    const seed = () => {
      const s = useWorkReportScopeStore.getState();
      s.setScopes([scopeA], "report_read");
      s.requirePick("câu hỏi", "report_read");
      s.select(scopeA);
      expect(useWorkReportScopeStore.getState().tokenQuestion).toBe("câu hỏi");
    };

    seed();
    useWorkReportScopeStore.getState().clearSelection();
    expect(useWorkReportScopeStore.getState().tokenQuestion).toBeNull();

    seed();
    useWorkReportScopeStore.getState().ensureScopeKey("u1", "department_submit");
    expect(useWorkReportScopeStore.getState().tokenQuestion).toBeNull();

    seed();
    useWorkReportScopeStore.getState().reset();
    expect(useWorkReportScopeStore.getState().tokenQuestion).toBeNull();
  });
});

describe("gắn scope_token vào request (§4)", () => {
  beforeEach(() => {
    useWorkReportScopeStore.getState().setScopes([scope()]);
  });

  it("query dùng URLSearchParams nên token được encode", () => {
    useWorkReportScopeStore.getState().setScopes([scope({ selectionToken: "a+b/c=" })]);
    const qs = appendScopeToken(new URLSearchParams({ all: "true" })).toString();
    expect(qs).toContain("scope_token=a%2Bb%2Fc%3D");
  });

  it("body JSON được trộn thêm scope_token", () => {
    expect(withScopeToken({ session_id: "s1" })).toEqual({
      session_id: "s1",
      scope_token: "token-1",
    });
  });

  it("URL sẵn có query vẫn giữ nguyên tham số cũ", () => {
    const url = appendScopeTokenToUrl("https://ai.example.com/api/level-reports/export?week_start=2026-07-20");
    expect(url).toContain("week_start=2026-07-20");
    expect(url).toContain("scope_token=token-1");
  });

  it("chưa chọn scope thì KHÔNG gửi field rỗng", () => {
    useWorkReportScopeStore.getState().reset();
    expect(withScopeToken({ a: 1 })).toEqual({ a: 1 });
    expect(appendScopeToken(new URLSearchParams()).toString()).toBe("");
  });
});

describe("xử lý lỗi (§5)", () => {
  beforeEach(() => {
    useWorkReportScopeStore.getState().setScopes([scope()]);
  });

  it("400 mở lại widget nhưng giữ lựa chọn hiện có", () => {
    expect(handleScopeErrorStatus(400)).toBe(true);
    expect(useWorkReportScopeStore.getState().isPicking).toBe(true);
  });

  it("403 xóa lựa chọn để buộc nạp lại /scopes", () => {
    expect(handleScopeErrorStatus(403)).toBe(true);
    const state = useWorkReportScopeStore.getState();
    expect(state.selected).toBeNull();
    expect(state.scopes).toBeNull();
    expect(getScopeToken()).toBeUndefined();
  });

  it("401/503 không đụng vào lựa chọn (không fallback scope cũ)", () => {
    expect(handleScopeErrorStatus(401)).toBe(false);
    expect(handleScopeErrorStatus(503)).toBe(false);
    expect(getScopeToken()).toBe("token-1");
  });
});

describe("nhãn hiển thị dựng từ response (§3)", () => {
  it("CORPORATION dùng nhãn cố định theo §3, không render actions thật", () => {
    expect(
      describeScope(
        scope({ scopeType: "CORPORATION", actions: ["AGGREGATE_CORPORATE_REPORTS"] }),
      ),
    ).toBe("Toàn TCT — xem, tổng hợp");
    // Kể cả actions chỉ có READ, nhãn TCT vẫn cố định (không thành "Toàn TCT — xem").
    expect(
      describeScope(scope({ scopeType: "CORPORATION", actions: ["READ"] })),
    ).toBe("Toàn TCT — xem, tổng hợp");
  });

  it("ORG_UNIT gồm tên đơn vị + action", () => {
    expect(
      describeScope(
        scope({
          scopeType: "ORG_UNIT",
          actions: ["READ", "SUBMIT"],
          reportingTargetName: "Công ty CP Năng lượng Hacom",
        }),
      ),
    ).toBe("Công ty CP Năng lượng Hacom — xem, nộp");
  });

  it("DEPARTMENT gồm phòng ban / công ty + action", () => {
    expect(describeScope(scope())).toBe(
      "Công ty CP Đầu tư và Xây lắp Bình Sơn / BCH Công trường Liền kề — xem",
    );
  });

  it("chỉ aggregate thì không được nộp (ẩn nút nộp, §6.2)", () => {
    expect(canSubmit(scope({ actions: ["AGGREGATE_CORPORATE_REPORTS"] }))).toBe(false);
    expect(canSubmit(scope({ actions: ["READ", "SUBMIT"] }))).toBe(true);
  });
});
