import { describe, expect, it } from "vitest";

import type { Conversation, Message } from "../types";
import type { SenderProfileSummary } from "./senderProfiles";
import {
  applySenderProfilesToConversation,
  applySenderProfilesToMessage,
  applySenderProfilesToMessages,
  normalizeSenderProfileSummary,
  normalizeSenderProfiles,
} from "./senderProfiles";

const message = (partial: Partial<Message>): Message =>
  ({ id: "m1", senderId: "u1", ...partial }) as Message;

const profile = (
  partial: Partial<SenderProfileSummary>,
): SenderProfileSummary =>
  ({
    id: "u1",
    username: "u1",
    displayName: "Nhật",
    avatar: null,
    status: null,
    ...partial,
  }) as SenderProfileSummary;

describe("normalizeSenderProfileSummary", () => {
  it("đọc id từ nhiều tên trường, hoặc lấy fallback", () => {
    expect(normalizeSenderProfileSummary({ id: "a" })?.id).toBe("a");
    expect(normalizeSenderProfileSummary({ userId: "b" })?.id).toBe("b");
    expect(normalizeSenderProfileSummary({ user_id: "c" })?.id).toBe("c");
    expect(normalizeSenderProfileSummary({}, "fallback")?.id).toBe("fallback");
  });

  it("không suy ra được id thì bỏ qua hồ sơ", () => {
    expect(normalizeSenderProfileSummary({})).toBeNull();
    expect(normalizeSenderProfileSummary(null)).toBeNull();
    expect(normalizeSenderProfileSummary("chuoi")).toBeNull();
  });

  it("thiếu username thì lùi về employeeCode rồi tới id", () => {
    expect(normalizeSenderProfileSummary({ id: "a", employeeCode: "HC01" })?.username).toBe("HC01");
    expect(normalizeSenderProfileSummary({ id: "a" })?.username).toBe("a");
  });

  it("avatar/status thiếu thì là null, không undefined", () => {
    const result = normalizeSenderProfileSummary({ id: "a" });
    expect(result?.avatar).toBeNull();
    expect(result?.status).toBeNull();
  });
});

describe("normalizeSenderProfiles", () => {
  it("khoá kết quả theo id đã chuẩn hoá, không theo khoá gốc", () => {
    const result = normalizeSenderProfiles({ "khoa-cu": { id: "u9" } });
    expect(result["u9"]).toBeDefined();
    expect(result["khoa-cu"]).toBeUndefined();
  });

  it("bỏ qua entry hỏng, giữ entry hợp lệ", () => {
    const result = normalizeSenderProfiles({ u1: { id: "u1" }, u2: null });
    expect(Object.keys(result)).toEqual(["u1"]);
  });

  it("đầu vào không phải object thì trả object rỗng", () => {
    expect(normalizeSenderProfiles(null)).toEqual({});
    expect(normalizeSenderProfiles("x")).toEqual({});
  });
});

describe("applySenderProfilesToMessage", () => {
  it("cập nhật tên người gửi từ hồ sơ", () => {
    const result = applySenderProfilesToMessage(
      message({ senderName: "cũ" }),
      { u1: profile({ displayName: "Nhật" }) },
    );
    expect(result.senderName).toBe("Nhật");
  });

  it("GIỮ NGUYÊN tham chiếu khi không có gì đổi (tránh re-render)", () => {
    const original = message({ senderName: "Nhật" });
    const result = applySenderProfilesToMessage(original, {
      u1: profile({ displayName: "Nhật" }),
    });
    expect(result).toBe(original);
  });

  it("không có hồ sơ nào thì trả nguyên tin nhắn", () => {
    const original = message({ senderName: "cũ" });
    expect(applySenderProfilesToMessage(original, {})).toBe(original);
  });

  it("avatar rỗng/khoảng trắng KHÔNG ghi đè avatar đang có", () => {
    const result = applySenderProfilesToMessage(
      message({ senderName: "Nhật", senderAvatar: "cu.png" }),
      { u1: profile({ displayName: "Nhật", avatar: "   " }) },
    );
    expect(result.senderAvatar).toBe("cu.png");
  });

  it("cập nhật cả người gửi của tin được trả lời", () => {
    const result = applySenderProfilesToMessage(
      message({
        senderName: "Nhật",
        replyToMessage: { senderId: "u2", senderName: "cũ" },
      } as never),
      {
        u1: profile({ displayName: "Nhật" }),
        u2: profile({ id: "u2", displayName: "Hoàng" }),
      },
    );
    expect(result.replyToMessage?.senderName).toBe("Hoàng");
  });
});

describe("applySenderProfilesToMessages", () => {
  it("giữ nguyên tham chiếu MẢNG khi không tin nào đổi", () => {
    const list = [message({ senderName: "Nhật" })];
    const result = applySenderProfilesToMessages(list, {
      u1: profile({ displayName: "Nhật" }),
    });
    expect(result).toBe(list);
  });

  it("trả mảng mới khi có ít nhất một tin đổi", () => {
    const list = [message({ senderName: "cũ" })];
    const result = applySenderProfilesToMessages(list, {
      u1: profile({ displayName: "Nhật" }),
    });
    expect(result).not.toBe(list);
    expect(result[0].senderName).toBe("Nhật");
  });

  it("mảng rỗng / đầu vào lạ không ném lỗi", () => {
    expect(applySenderProfilesToMessages([], {})).toEqual([]);
    expect(
      applySenderProfilesToMessages(null as never, {}),
    ).toBeNull();
  });
});

describe("applySenderProfilesToConversation", () => {
  const conversation = (partial: Partial<Conversation>): Conversation =>
    ({ id: "c1", ...partial }) as Conversation;

  it("cập nhật thành viên theo hồ sơ", () => {
    const result = applySenderProfilesToConversation(
      conversation({
        participants: [{ id: "u1", username: "u1", displayName: "cũ" }],
      } as never),
      { u1: profile({ displayName: "Nhật" }) },
    );
    expect(result.participants?.[0].displayName).toBe("Nhật");
  });

  it("giữ nguyên tham chiếu khi không có hồ sơ", () => {
    const original = conversation({ participants: [] } as never);
    expect(applySenderProfilesToConversation(original, {})).toBe(original);
  });

  it("thành viên không có hồ sơ thì giữ nguyên tham chiếu của chính họ", () => {
    const participant = { id: "u9", username: "u9", displayName: "giữ" };
    const result = applySenderProfilesToConversation(
      conversation({ participants: [participant] } as never),
      { u1: profile({}) },
    );
    expect(result.participants?.[0]).toBe(participant);
  });
});
