import { describe, expect, it } from "vitest";
import { buildLocalFileName } from "./desktopBridge";

const identity = {
  currentUserId: "user-1",
  conversationId: "conversation-1",
  attachmentKey: "archive-1",
};

describe("buildLocalFileName", () => {
  it("is stable for one full cache identity", () => {
    expect(buildLocalFileName(identity, "PC (1).rar")).toBe(
      buildLocalFileName({ ...identity }, "PC (1).rar"),
    );
  });

  it("separates the same attachment across users and conversations", () => {
    const original = buildLocalFileName(identity, "PC (1).rar");

    expect(
      buildLocalFileName(
        { ...identity, currentUserId: "user-2" },
        "PC (1).rar",
      ),
    ).not.toBe(original);
    expect(
      buildLocalFileName(
        { ...identity, conversationId: "conversation-2" },
        "PC (1).rar",
      ),
    ).not.toBe(original);
  });

  it("does not probe the legacy eight-character cache name", () => {
    expect(buildLocalFileName(identity, "PC (1).rar")).not.toBe(
      "PC (1)_rchive-1.rar",
    );
  });

  it("stays Windows-safe and within the desktop store byte limit", () => {
    const localName = buildLocalFileName(
      identity,
      `${"Báo cáo<>:\"/\\|?*".repeat(30)}.xlsx`,
    );

    expect(localName).not.toMatch(/[\u0000-\u001f<>:"/\\|?*]/);
    expect(
      new TextEncoder().encode(localName).byteLength,
    ).toBeLessThanOrEqual(180);
    expect(localName).toMatch(/\.xlsx$/);
  });
});
