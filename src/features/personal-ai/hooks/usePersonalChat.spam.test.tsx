import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePersonalChat } from "./usePersonalChat";
import { usePersonalAiStore } from "../stores/personalAiStore";
import { useWorkReportScopeStore } from "../stores/workReportScopeStore";

/**
 * Bấm Gửi liên tiếp cùng một câu ("spam") không được sinh ra nhiều lượt hỏi.
 *
 * Bug thật: guard đầu `sendMessage` đọc `isStreaming` — một state nằm trong
 * closure của `useCallback`, mà giữa lúc kiểm tra với lúc `setIsStreaming(true)`
 * còn có `await fetchWorkReportScopes(...)`. Mọi lượt bấm trong khoảng đó đều
 * thấy `isStreaming === false` nên chạy tiếp: n bong bóng hỏi, n thẻ "Chọn phạm
 * vi", n request — máy đơ dần.
 */

const streamPersonalChatMock = vi.fn();
const fetchWorkReportScopesMock = vi.fn();

vi.mock("../api/personalAiApi", async () => {
  const actual = await vi.importActual<typeof import("../api/personalAiApi")>(
    "../api/personalAiApi",
  );
  return {
    ...actual,
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

const QUESTION = "tổng hợp công việc của tất cả mọi người";

function messagesOfActive() {
  const s = usePersonalAiStore.getState();
  return s.conversations.find((c) => c.id === s.activeConversationId)?.messages ?? [];
}

describe("sendMessage — chống bấm Gửi liên tiếp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePersonalAiStore.getState().clearStore();
    useWorkReportScopeStore.getState().reset?.();
  });

  it("ba lượt bấm chồng nhau chỉ tạo MỘT lượt hỏi và MỘT request", async () => {
    // Stream treo tới khi test cho phép — mô phỏng BE trả lời chậm, đúng lúc
    // người dùng sốt ruột bấm thêm.
    let release: () => void = () => {};
    streamPersonalChatMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ answer: "xong", session_id: "sess-1" });
        }),
    );

    const { result } = renderHook(() => usePersonalChat());

    await act(async () => {
      // KHÔNG await từng cái: bấm chồng nhau đúng như user spam.
      void result.current.sendMessage(QUESTION);
      void result.current.sendMessage(QUESTION);
      void result.current.sendMessage(QUESTION);
    });

    await waitFor(() => {
      expect(streamPersonalChatMock).toHaveBeenCalledTimes(1);
    });

    // Đúng một cặp user + assistant, không phải ba.
    const userBubbles = messagesOfActive().filter((m) => m.role === "user");
    expect(userBubbles).toHaveLength(1);

    await act(async () => {
      release();
    });
  });

  it("gửi lại được sau khi lượt trước xong (khóa có nhả)", async () => {
    streamPersonalChatMock.mockResolvedValue({ answer: "xong", session_id: "sess-1" });

    const { result } = renderHook(() => usePersonalChat());

    await act(async () => {
      await result.current.sendMessage(QUESTION);
    });
    await act(async () => {
      await result.current.sendMessage("câu thứ hai");
    });

    expect(streamPersonalChatMock).toHaveBeenCalledTimes(2);
    expect(messagesOfActive().filter((m) => m.role === "user")).toHaveLength(2);
  });
});
