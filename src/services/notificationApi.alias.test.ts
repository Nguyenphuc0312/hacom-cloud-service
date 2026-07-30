import { describe, expect, it } from "vitest";
import { applyAliasToNotification, type BackendNotification } from "./notificationApi";

const base: BackendNotification = {
  id: "n1",
  type: "MENTIONED_IN_MESSAGE",
  title: "Minh Nhật kiểm thử đã nhắc đến bạn",
  body: "Minh Nhật kiểm thử: đi về thoi",
  targetType: "message",
  targetId: "m1",
  metadata: { senderName: "Minh Nhật kiểm thử" },
  readAt: null,
  createdAt: "2026-07-06T00:00:00.000Z",
  actorUserId: "u1",
};

describe("applyAliasToNotification", () => {
  it("swaps the baked real name with the alias in title and body", () => {
    const { title, body } = applyAliasToNotification(base, { u1: "Sếp deadline" });
    expect(title).toBe("Sếp deadline đã nhắc đến bạn");
    expect(body).toBe("Sếp deadline: đi về thoi");
  });

  it("leaves text untouched when no alias / no metadata name", () => {
    expect(applyAliasToNotification(base, {})).toEqual({
      title: base.title,
      body: base.body,
    });
    const noMeta = { ...base, metadata: {} };
    expect(applyAliasToNotification(noMeta, { u1: "Sếp" })).toEqual({
      title: base.title,
      body: base.body,
    });
  });

  it("đổi tag @ trong body theo metadata.mentions", () => {
    const n: BackendNotification = {
      ...base,
      body: "Minh Nhật kiểm thử: @Nguyễn Minh Quang xem giúp nhé",
      metadata: {
        senderName: "Minh Nhật kiểm thử",
        mentions: [{ userId: "u2", displayName: "Nguyễn Minh Quang" }],
      },
    };
    const { body } = applyAliasToNotification(n, {
      u1: "Sếp deadline",
      u2: "Quang IT",
    });
    expect(body).toBe("Sếp deadline: @Quang IT xem giúp nhé");
  });

  it("chỉ đổi tag của người CÓ alias", () => {
    const n: BackendNotification = {
      ...base,
      body: "Minh Nhật kiểm thử: @Nguyễn Minh Quang @Vũ Minh Quốc họp nhé",
      metadata: {
        senderName: "Minh Nhật kiểm thử",
        mentions: [
          { userId: "u2", displayName: "Nguyễn Minh Quang" },
          { userId: "u3", displayName: "Vũ Minh Quốc" },
        ],
      },
    };
    const { body } = applyAliasToNotification(n, { u2: "Quang IT" });
    expect(body).toBe(
      "Minh Nhật kiểm thử: @Quang IT @Vũ Minh Quốc họp nhé",
    );
  });

  // Người gửi và người bị tag trùng tên thật: thay tên người gửi trước có thể
  // ăn mất chuỗi "@Tên" của tag. Tag phải theo alias của CHÍNH người bị tag.
  it("người gửi trùng tên người bị tag thì tag vẫn đúng người", () => {
    const n: BackendNotification = {
      ...base,
      body: "Nguyễn Minh Quang: @Nguyễn Minh Quang ơi",
      metadata: {
        senderName: "Nguyễn Minh Quang",
        mentions: [{ userId: "u2", displayName: "Nguyễn Minh Quang" }],
      },
    };
    const { body } = applyAliasToNotification(n, {
      u1: "Sếp deadline",
      u2: "Quang IT",
    });
    expect(body).toBe("Sếp deadline: @Quang IT ơi");
  });

  // Ca hiếm nhưng có thật: BE nướng tên người gửi vào body ĐÚNG dạng "@Tên"
  // (vd tin nhắn mở đầu bằng chính tag đó). Khi ấy hai cặp thay có cùng chuỗi
  // nguồn — tag phải thắng, vì đoạn đó là tag chứ không phải tên người gửi.
  it("tag và tên người gửi trùng hệt chuỗi nguồn thì tag thắng", () => {
    const n: BackendNotification = {
      ...base,
      title: "@Nguyễn Minh Quang đã nhắc đến bạn",
      body: "@Nguyễn Minh Quang ơi",
      metadata: {
        senderName: "@Nguyễn Minh Quang",
        mentions: [{ userId: "u2", displayName: "Nguyễn Minh Quang" }],
      },
    };
    const { body } = applyAliasToNotification(n, {
      u1: "Sếp deadline",
      u2: "Quang IT",
    });
    expect(body).toBe("@Quang IT ơi");
  });

  it("metadata.mentions rác thì bỏ qua, không vỡ", () => {
    const n: BackendNotification = {
      ...base,
      body: "Minh Nhật kiểm thử: @Nguyễn Minh Quang ơi",
      metadata: {
        senderName: "Minh Nhật kiểm thử",
        mentions: [null, "u2", { userId: "u2" }, { displayName: "X" }],
      },
    };
    expect(applyAliasToNotification(n, { u2: "Quang IT" }).body).toBe(n.body);
  });
});
