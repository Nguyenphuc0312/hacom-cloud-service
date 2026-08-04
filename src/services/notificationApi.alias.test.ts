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
});
