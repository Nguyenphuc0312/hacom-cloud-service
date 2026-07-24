import { beforeEach, describe, expect, it } from "vitest";
import {
  appendScopeToken,
  appendScopeTokenToUrl,
  getScopeToken,
  handleScopeErrorStatus,
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
  it("count == 1 thì tự chọn và giữ token, không bắt user chọn", () => {
    useWorkReportScopeStore.getState().setScopes([scope()]);
    const state = useWorkReportScopeStore.getState();
    expect(state.isPicking).toBe(false);
    expect(getScopeToken()).toBe("token-1");
  });

  it("count > 1 thì bắt buộc chọn, chưa chọn thì chưa có token", () => {
    useWorkReportScopeStore
      .getState()
      .setScopes([scope(), scope({ authorizationId: "auth-2", selectionToken: "token-2" })]);
    expect(useWorkReportScopeStore.getState().isPicking).toBe(true);
    expect(getScopeToken()).toBeUndefined();
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
  it("CORPORATION", () => {
    expect(
      describeScope(
        scope({ scopeType: "CORPORATION", actions: ["AGGREGATE_CORPORATE_REPORTS"] }),
      ),
    ).toBe("Toàn TCT — tổng hợp");
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
