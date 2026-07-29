import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePersonalChat } from "./usePersonalChat";
import { usePersonalAiStore } from "../stores/personalAiStore";
import { useWorkReportScopeStore } from "../stores/workReportScopeStore";
import { LevelReportScopeRequiredError } from "../api/personalAiApi";
import type { WorkReportScope } from "../types";

/**
 * §2.5 — điều phối "nộp file → BE hỏi phạm vi → user chọn → tự nộp lại".
 *
 * Đây là phần KHÔNG kiểm được bằng test đơn vị của api/store: nó nằm ở hai
 * useEffect chạy cạnh nhau (gửi-lại-chat và nộp-lại-file) cùng đọc một store
 * Zustand. Test này chạy hook thật + store thật, chỉ mock lớp mạng.
 */

const uploadLevelReportMock = vi.fn();
const streamPersonalChatMock = vi.fn();
const fetchWorkReportScopesMock = vi.fn();

vi.mock("../api/personalAiApi", async () => {
  const actual = await vi.importActual<typeof import("../api/personalAiApi")>(
    "../api/personalAiApi",
  );
  return {
    ...actual,
    uploadLevelReport: (...args: unknown[]) => uploadLevelReportMock(...args),
    streamPersonalChat: (...args: unknown[]) => streamPersonalChatMock(...args),
  };
});

vi.mock("../api/workReportScopeApi", async () => {
  const actual = await vi.importActual<typeof import("../api/workReportScopeApi")>(
    "../api/workReportScopeApi",
  );
  return {
    ...actual,
    fetchWorkReportScopes: (...args: unknown[]) => fetchWorkReportScopesMock(...args),
  };
});

vi.mock("../../../stores/authStore", () => ({
  useAuthStore: (selector: (state: { user: { id: string } }) => unknown) =>
    selector({ user: { id: "u1" } }),
}));

function scope(overrides: Partial<WorkReportScope> = {}): WorkReportScope {
  return {
    authorizationId: "auth-1",
    authorizationVersion: 1,
    actions: ["READ", "SUBMIT"],
    scopeType: "DEPARTMENT",
    scopeId: "s1",
    scopeName: "BCH Công trường Liền kề",
    reportingTargetType: "DEPARTMENT",
    reportingTargetId: "t1",
    reportingTargetName: "BCH Công trường Liền kề",
    reportingUnitId: "u1",
    reportingUnitName: "Công ty CP Năng lượng Hacom",
    selectionToken: "tok-A",
    ...overrides,
  };
}

const scopeA = scope();
const scopeB = scope({
  authorizationId: "auth-2",
  reportingTargetName: "Văn phòng TCT",
  selectionToken: "tok-B",
});

/** Lỗi 400 BE trả khi còn nhiều phạm vi — mang sẵn dữ liệu dựng dropdown. */
function scopeRequiredError(promptId = "prompt-1") {
  return new LevelReportScopeRequiredError(400, {
    reason: "multiple_matching_authorizations",
    message: "Bạn có nhiều phạm vi phù hợp. Vui lòng chọn một phạm vi rồi gửi lại.",
    promptId,
    question: "#TBP_baocao",
    capability: "department_submit",
    requiredAction: "SUBMIT",
    allowedScopeTypes: ["DEPARTMENT"],
    scopes: [scopeA, scopeB],
  });
}

const FILE = new File(["noi dung"], "bao-cao-tuan.xlsx");

beforeEach(() => {
  vi.clearAllMocks();
  useWorkReportScopeStore.getState().reset();
  usePersonalAiStore.setState({ conversations: [], activeConversationId: null });
});

describe("usePersonalChat — nộp file kèm chọn phạm vi (§2.5)", () => {
  it("400 có scopes → mở dropdown, chọn xong tự nộp lại ĐÚNG MỘT LẦN với cùng File + token mới", async () => {
    uploadLevelReportMock
      .mockRejectedValueOnce(scopeRequiredError())
      .mockResolvedValueOnce({ ok: true, message: "Đã nhận báo cáo." });

    const { result } = renderHook(() => usePersonalChat());

    await act(async () => {
      await result.current.sendLevelReportWithFile("#TBP_baocao", FILE);
    });

    // Lượt nộp đầu: gửi TRẦN (không token) để BE tự bind nếu chỉ một phạm vi (§2.4).
    expect(uploadLevelReportMock).toHaveBeenCalledTimes(1);
    expect(uploadLevelReportMock.mock.calls[0][1]).toMatchObject({
      question: "#TBP_baocao",
      scopeToken: undefined,
    });

    // Dropdown mở sẵn từ payload lỗi — KHÔNG gọi /scopes.
    const picking = useWorkReportScopeStore.getState();
    expect(picking.isPicking).toBe(true);
    expect(picking.scopes).toHaveLength(2);
    expect(picking.pendingPromptId).toBe("prompt-1");
    expect(fetchWorkReportScopesMock).not.toHaveBeenCalled();

    // User chọn phòng B.
    await act(async () => {
      useWorkReportScopeStore.getState().select(scopeB);
    });

    await waitFor(() => expect(uploadLevelReportMock).toHaveBeenCalledTimes(2));

    // Nộp lại: CÙNG File (không bắt đính lại), token của phòng vừa chọn.
    const [retryFile, retryParams] = uploadLevelReportMock.mock.calls[1];
    expect(retryFile).toBe(FILE);
    expect(retryParams).toMatchObject({
      question: "#TBP_baocao",
      scopeToken: "tok-B",
    });

    // Câu hỏi hoãn thuộc lượt NỘP FILE — không được gửi thêm qua luồng chat.
    expect(streamPersonalChatMock).not.toHaveBeenCalled();

    // Không nộp lần ba dù store còn `selected` sau khi nộp xong.
    await new Promise((r) => setTimeout(r, 20));
    expect(uploadLevelReportMock).toHaveBeenCalledTimes(2);
  });

  it("nộp xong thì nhả token — lượt nộp sau lại gửi trần để BE hỏi lại phạm vi (§4)", async () => {
    uploadLevelReportMock
      .mockRejectedValueOnce(scopeRequiredError())
      .mockResolvedValue({ ok: true, message: "Đã nhận báo cáo." });

    const { result } = renderHook(() => usePersonalChat());
    await act(async () => {
      await result.current.sendLevelReportWithFile("#TBP_baocao", FILE);
    });
    await act(async () => {
      useWorkReportScopeStore.getState().select(scopeB);
    });
    await waitFor(() => expect(uploadLevelReportMock).toHaveBeenCalledTimes(2));

    await waitFor(() =>
      expect(useWorkReportScopeStore.getState().selected).toBeNull(),
    );
    expect(useWorkReportScopeStore.getState().scopes).toBeNull();
  });

  it("user bấm Hủy trên dropdown → bỏ lượt nộp, KHÔNG nộp lại lén", async () => {
    uploadLevelReportMock.mockRejectedValueOnce(scopeRequiredError());

    const { result } = renderHook(() => usePersonalChat());
    await act(async () => {
      await result.current.sendLevelReportWithFile("#TBP_baocao", FILE);
    });

    await act(async () => {
      useWorkReportScopeStore.getState().cancelPick();
    });

    await new Promise((r) => setTimeout(r, 20));
    expect(uploadLevelReportMock).toHaveBeenCalledTimes(1);

    // Hủy xong mà sau đó có lựa chọn (vd luồng chat khác chọn scope) cũng không
    // được đánh thức lượt nộp đã bỏ.
    await act(async () => {
      useWorkReportScopeStore.getState().setScopes([scopeA, scopeB], "department_submit");
      useWorkReportScopeStore.getState().select(scopeA);
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(uploadLevelReportMock).toHaveBeenCalledTimes(1);
  });

  it("lỗi không phải scope (413 quá dung lượng) → không mở dropdown, không giữ file", async () => {
    const { PersonalAiError } = await vi.importActual<
      typeof import("../api/personalAiApi")
    >("../api/personalAiApi");
    uploadLevelReportMock.mockRejectedValueOnce(new PersonalAiError(413, "http"));

    const { result } = renderHook(() => usePersonalChat());
    await act(async () => {
      await result.current.sendLevelReportWithFile("#TBP_baocao", FILE);
    });

    expect(useWorkReportScopeStore.getState().isPicking).toBe(false);

    await act(async () => {
      useWorkReportScopeStore.getState().setScopes([scopeA, scopeB], "department_submit");
      useWorkReportScopeStore.getState().select(scopeA);
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(uploadLevelReportMock).toHaveBeenCalledTimes(1);
  });
});
