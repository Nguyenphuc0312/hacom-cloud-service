import { describe, expect, it } from "vitest";

import {
  getRealtimeMessageContent,
  getRealtimeSenderName,
  getSenderProfile,
  normalizeDeviceType,
  parseTypingExpiryMs,
  shouldSkipGroupConversationRefreshForCurrentUser,
  shouldUseDeltaConversationRefresh,
  toRealtimeConnectionStatus,
} from "./realtimePayload";

describe("getSenderProfile", () => {
  it("ưu tiên message.sender rồi mới tới payload.sender", () => {
    expect(
      getSenderProfile({ sender: { id: "p" } }, { sender: { id: "m" } }),
    ).toEqual({ id: "m" });
  });

  it("lùi về `from` khi không có `sender`", () => {
    expect(getSenderProfile({}, { from: { id: "f" } })).toEqual({ id: "f" });
  });

  it("không có gì thì trả null, không ném lỗi", () => {
    expect(getSenderProfile({}, {})).toBeNull();
  });
});

describe("getRealtimeSenderName", () => {
  it("ưu tiên tên phẳng trên message trước hồ sơ lồng nhau", () => {
    expect(
      getRealtimeSenderName({}, { senderName: "Nhật", sender: { displayName: "X" } }),
    ).toBe("Nhật");
  });

  it("đọc được biến thể snake_case", () => {
    expect(getRealtimeSenderName({}, { sender_name: "Nhật" })).toBe("Nhật");
  });

  it("lùi dần displayName → name → username trong hồ sơ", () => {
    expect(getRealtimeSenderName({}, { sender: { username: "nhatdc" } })).toBe(
      "nhatdc",
    );
  });

  it("không suy ra được tên thì trả null (để nơi gọi tự quyết fallback)", () => {
    expect(getRealtimeSenderName({}, {})).toBeNull();
  });

  it("chuỗi rỗng/khoảng trắng không được coi là tên hợp lệ", () => {
    expect(getRealtimeSenderName({}, { senderName: "   " })).toBeNull();
  });
});

describe("getRealtimeMessageContent", () => {
  it("thử lần lượt content → body → text trên message rồi mới tới payload", () => {
    expect(getRealtimeMessageContent({}, { content: "c" })).toBe("c");
    expect(getRealtimeMessageContent({}, { body: "b" })).toBe("b");
    expect(getRealtimeMessageContent({}, { text: "t" })).toBe("t");
    expect(getRealtimeMessageContent({ content: "p" }, {})).toBe("p");
  });

  it("không có nội dung thì trả chuỗi rỗng, KHÔNG null", () => {
    // Nơi gọi render thẳng giá trị này nên phải luôn là string.
    expect(getRealtimeMessageContent({}, {})).toBe("");
  });
});

describe("shouldSkipGroupConversationRefreshForCurrentUser", () => {
  it("bỏ qua refresh khi sự kiện là do chính mình gây ra", () => {
    expect(
      shouldSkipGroupConversationRefreshForCurrentUser({ userId: "u1" }, "u1"),
    ).toBe(true);
    expect(
      shouldSkipGroupConversationRefreshForCurrentUser(
        { targetUserId: "u1" },
        "u1",
      ),
    ).toBe(true);
  });

  it("người khác gây ra thì vẫn phải refresh", () => {
    expect(
      shouldSkipGroupConversationRefreshForCurrentUser({ userId: "u2" }, "u1"),
    ).toBe(false);
  });

  it("thiếu payload hoặc chưa biết mình là ai → không bỏ qua (an toàn hơn)", () => {
    expect(shouldSkipGroupConversationRefreshForCurrentUser(null, "u1")).toBe(
      false,
    );
    expect(
      shouldSkipGroupConversationRefreshForCurrentUser({ userId: "u1" }, null),
    ).toBe(false);
  });
});

describe("shouldUseDeltaConversationRefresh", () => {
  it("dùng delta cho hội thoại đang mở", () => {
    expect(
      shouldUseDeltaConversationRefresh({
        conversationId: "c1",
        selectedConversationId: "c1",
        joinedConversationIds: new Set(),
      }),
    ).toBe(true);
  });

  it("dùng delta cho hội thoại đã join", () => {
    expect(
      shouldUseDeltaConversationRefresh({
        conversationId: "c1",
        selectedConversationId: null,
        joinedConversationIds: new Set(["c1"]),
      }),
    ).toBe(true);
  });

  it("hội thoại không liên quan thì không dùng delta", () => {
    expect(
      shouldUseDeltaConversationRefresh({
        conversationId: "c9",
        selectedConversationId: "c1",
        joinedConversationIds: new Set(["c2"]),
      }),
    ).toBe(false);
  });

  it("thiếu conversationId thì false, và luôn trả boolean", () => {
    const result = shouldUseDeltaConversationRefresh({
      conversationId: null,
      selectedConversationId: "c1",
      joinedConversationIds: new Set(),
    });
    expect(result).toBe(false);
    expect(typeof result).toBe("boolean");
  });
});

describe("toRealtimeConnectionStatus", () => {
  it("gộp các trạng thái trung gian về 'connecting'", () => {
    for (const state of ["connecting", "authenticating", "reconnecting"] as const) {
      expect(toRealtimeConnectionStatus(state)).toBe("connecting");
    }
  });

  it("lỗi xác thực và lỗi chung đều là 'error'", () => {
    expect(toRealtimeConnectionStatus("auth_failed")).toBe("error");
    expect(toRealtimeConnectionStatus("error")).toBe("error");
  });

  it("trạng thái lạ thì coi như đã ngắt (mặc định an toàn)", () => {
    expect(toRealtimeConnectionStatus("connected")).toBe("connected");
    expect(toRealtimeConnectionStatus("khong-biet" as never)).toBe(
      "disconnected",
    );
  });
});

describe("parseTypingExpiryMs", () => {
  it("dùng mốc server khi mốc đó còn ở tương lai", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(parseTypingExpiryMs(future)).toBe(Date.parse(future));
  });

  it("mốc đã qua / rác / null → lùi về TTL mặc định 5s", () => {
    const before = Date.now();
    for (const bad of [
      new Date(Date.now() - 60_000).toISOString(),
      "khong-phai-ngay",
      null,
    ]) {
      const result = parseTypingExpiryMs(bad);
      expect(result).toBeGreaterThanOrEqual(before + 5_000 - 50);
    }
  });
});

describe("normalizeDeviceType", () => {
  it("chỉ chấp nhận mobile/desktop, còn lại là web", () => {
    expect(normalizeDeviceType("mobile")).toBe("mobile");
    expect(normalizeDeviceType("desktop")).toBe("desktop");
    expect(normalizeDeviceType("web")).toBe("web");
    expect(normalizeDeviceType("tivi")).toBe("web");
    expect(normalizeDeviceType(null)).toBe("web");
  });
});
