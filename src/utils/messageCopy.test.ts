import { describe, expect, it } from "vitest";
import { MessageStatus, MessageType, type Message } from "../types";
import { getCopyableMessageText } from "./messageCopy";

const baseMessage = (overrides: Partial<Message>): Message =>
  ({
    id: "m-1",
    conversationId: "c-1",
    senderId: "u-1",
    senderName: "Sender",
    content: "",
    type: MessageType.TEXT,
    status: MessageStatus.SENT,
    isDeleted: false,
    isSystem: false,
    isEdited: false,
    isPinned: false,
    createdAt: new Date().toISOString() as unknown as Date,
    ...overrides,
  }) as Message;

describe("getCopyableMessageText", () => {
  it("returns plain visible text with Vietnamese, emoji, URL, and line breaks", () => {
    const message = baseMessage({
      content: "Xin chào bạn\nXem https://example.test 😊",
    });

    expect(getCopyableMessageText(message)).toBe(
      "Xin chào bạn\nXem https://example.test 😊",
    );
  });

  it("converts rich text and HTML to clean plain text", () => {
    const message = baseMessage({
      contentFormat: "rich_text",
      content:
        "<p><strong>Xin chào</strong> bạn</p><script>alert(1)</script><p>Dòng 2</p>",
    });

    expect(getCopyableMessageText(message)).toBe("Xin chào bạn\nDòng 2");
  });

  it("uses canonical HTML for rich text messages", () => {
    const message = baseMessage({
      contentFormat: "rich_text",
      content: "<p><strong>raw</strong></p>",
      plainText: "stale plain text",
    });

    expect(getCopyableMessageText(message)).toBe("raw");
  });

  it("keeps mention-all and line breaks from rich HTML when legacy plainText is corrupt", () => {
    const message = baseMessage({
      contentFormat: "rich_text",
      content: "<p>@all Desktop updated.</p><p>Please install it.</p>",
      plainText: "Desktop updated. Please install it. @all",
      mentions: [{ userId: "all", displayName: "all" }],
    });

    expect(getCopyableMessageText(message)).toBe(
      "@all Desktop updated.\nPlease install it.",
    );
  });

  it("rewrites internal mention tokens to display names", () => {
    const message = baseMessage({
      content: "<@u-2> kiểm tra giúp mình nhé",
      mentions: [{ userId: "u-2", displayName: "Nguyễn Văn A" }],
    });

    expect(getCopyableMessageText(message)).toBe(
      "@Nguyễn Văn A kiểm tra giúp mình nhé",
    );
  });

  it("copies attachment captions but not attachment-only media", () => {
    expect(
      getCopyableMessageText(
        baseMessage({ type: MessageType.IMAGE, content: "Caption ảnh" }),
      ),
    ).toBe("Caption ảnh");

    expect(
      getCopyableMessageText(baseMessage({ type: MessageType.IMAGE })),
    ).toBeNull();
  });

  it("returns null for non-text and recalled/deleted messages", () => {
    expect(
      getCopyableMessageText(
        baseMessage({ type: MessageType.AUDIO, content: "audio caption" }),
      ),
    ).toBeNull();
    expect(
      getCopyableMessageText(
        baseMessage({ type: MessageType.LOCATION, content: "location" }),
      ),
    ).toBeNull();
    expect(
      getCopyableMessageText(
        baseMessage({ type: MessageType.SYSTEM, content: "system" }),
      ),
    ).toBeNull();
    expect(
      getCopyableMessageText(
        baseMessage({ lifecycleStatus: "recalled", content: "secret" }),
      ),
    ).toBeNull();
  });

  it("handles nullish or malformed content safely", () => {
    expect(
      getCopyableMessageText(
        baseMessage({ content: null as unknown as string }),
      ),
    ).toBeNull();
  });
});
