import { describe, expect, it } from "vitest";
import { MessageStatus, MessageType, type Message } from "../types";
import { resolveMessageActions } from "./messageActionPolicy";

const message = (overrides: Partial<Message> = {}): Message =>
  ({
    id: "m-1",
    conversationId: "c-1",
    senderId: "u-1",
    senderName: "Sender",
    content: "Copyable text",
    type: MessageType.TEXT,
    status: MessageStatus.SENT,
    isDeleted: false,
    isSystem: false,
    isEdited: false,
    isPinned: false,
    createdAt: new Date().toISOString() as unknown as Date,
    ...overrides,
  }) as Message;

describe("resolveMessageActions", () => {
  it("orders the desktop rail as reply, react, copy, forward, more", () => {
    expect(
      resolveMessageActions({
        message: message(),
        isOwn: false,
        isCoarsePointer: false,
        canForward: true,
        canPin: true,
        canSelect: true,
      }),
    ).toEqual({
      railActions: ["reply", "react", "copy", "forward", "more"],
      menuActions: ["pin", "save", "select"],
    });
  });

  it("uses the inverse labels for pinned and saved messages in More", () => {
    expect(
      resolveMessageActions({
        message: message({ isPinned: true }),
        isOwn: false,
        isCoarsePointer: false,
        canForward: true,
        canPin: true,
        isPinned: true,
        isSaved: true,
        canSelect: true,
      }).menuActions,
    ).toEqual(["unpin", "unsave", "select"]);
  });
});
