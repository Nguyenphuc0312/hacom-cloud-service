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
  it("orders the desktop rail and the Zalo-style More menu", () => {
    expect(
      resolveMessageActions({
        message: message(),
        isOwn: false,
        isCoarsePointer: false,
        canForward: true,
        canPin: true,
        canSelect: true,
        canDelete: true,
      }),
    ).toEqual({
      railActions: ["reply", "react", "copy", "forward", "more"],
      menuActions: ["copy", "pin", "select", "deleteForMe"],
    });
  });

  it("offers recall before delete-for-me on own messages", () => {
    expect(
      resolveMessageActions({
        message: message(),
        isOwn: true,
        isCoarsePointer: false,
        canForward: true,
        canSelect: true,
        canDelete: true,
      }).menuActions,
    ).toEqual(["copy", "select", "recall", "deleteForMe"]);
  });

  it("offers edit on own text messages, above the destructive block", () => {
    expect(
      resolveMessageActions({
        message: message(),
        isOwn: true,
        isCoarsePointer: false,
        canSelect: true,
        canDelete: true,
        canEdit: true,
      }).menuActions,
    ).toEqual(["copy", "select", "edit", "recall", "deleteForMe"]);
  });

  it("hides edit on other people's messages and on non-text messages", () => {
    expect(
      resolveMessageActions({
        message: message(),
        isOwn: false,
        isCoarsePointer: false,
        canDelete: true,
        canEdit: true,
      }).menuActions,
    ).not.toContain("edit");

    expect(
      resolveMessageActions({
        message: message({ type: MessageType.IMAGE }),
        isOwn: true,
        isCoarsePointer: false,
        canDelete: true,
        canEdit: true,
      }).menuActions,
    ).not.toContain("edit");
  });

  it("keeps edit available past the 24h recall window", () => {
    const twentyFiveHoursAgo = new Date(
      Date.now() - 25 * 60 * 60 * 1000,
    ).toISOString() as unknown as Date;

    const menuActions = resolveMessageActions({
      message: message({ createdAt: twentyFiveHoursAgo }),
      isOwn: true,
      isCoarsePointer: false,
      canDelete: true,
      canEdit: true,
    }).menuActions;

    expect(menuActions).toContain("edit");
    expect(menuActions).not.toContain("recall");
  });

  it("drops recall after the 24h window, keeping delete-for-me", () => {
    const twentyFiveHoursAgo = new Date(
      Date.now() - 25 * 60 * 60 * 1000,
    ).toISOString() as unknown as Date;

    expect(
      resolveMessageActions({
        message: message({ createdAt: twentyFiveHoursAgo }),
        isOwn: true,
        isCoarsePointer: false,
        canForward: true,
        canSelect: true,
        canDelete: true,
      }).menuActions,
    ).toEqual(["copy", "select", "deleteForMe"]);
  });

  it("offers admin delete-for-everyone on others' messages for owners", () => {
    expect(
      resolveMessageActions({
        message: message(),
        isOwn: false,
        isCoarsePointer: false,
        canForward: true,
        canSelect: true,
        canDelete: true,
        canRecallOthers: true,
      }).menuActions,
    ).toEqual(["copy", "select", "adminDelete", "deleteForMe"]);
  });

  it("Cloud cá nhân: media cũng chỉ có đúng 1 nút Xóa", () => {
    expect(
      resolveMessageActions({
        message: message({ type: MessageType.IMAGE, content: "" }),
        isOwn: true,
        isCoarsePointer: false,
        canPin: true,
        canDelete: true,
        isPersonalCloud: true,
      }).menuActions,
    ).toEqual(["pin", "deleteForMe"]);
  });

  it("Cloud cá nhân: text/link có đúng 1 nút Xóa, không thu hồi", () => {
    const menuActions = resolveMessageActions({
      message: message(),
      isOwn: true,
      isCoarsePointer: false,
      canPin: true,
      canDelete: true,
      isPersonalCloud: true,
    }).menuActions;

    expect(menuActions).toEqual(["copy", "pin", "deleteForMe"]);
    expect(menuActions).not.toContain("recall");
  });

  it("uses the inverse label for pinned messages and hides delete without permission", () => {
    expect(
      resolveMessageActions({
        message: message({ isPinned: true }),
        isOwn: false,
        isCoarsePointer: false,
        canForward: true,
        canPin: true,
        isPinned: true,
        canSelect: true,
      }).menuActions,
    ).toEqual(["copy", "unpin", "select"]);
  });
});
