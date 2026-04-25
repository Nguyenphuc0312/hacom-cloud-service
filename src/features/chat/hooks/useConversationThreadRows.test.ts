import { describe, expect, it } from "vitest";

import type { ConversationTimelineItem } from "./useConversationTimelineRows";
import {
  buildConversationThreadRows,
} from "./useConversationThreadRows";
import { MessageStatus, MessageType, RoomType } from "../../../types";

const buildMessageItem = (
  id: string,
  overrides: Partial<Extract<ConversationTimelineItem, { kind: "message" }>> = {},
): Extract<ConversationTimelineItem, { kind: "message" }> => ({
  kind: "message",
  key: `message-${id}`,
  messageId: id,
  message: {
    id,
    conversationId: "room-1",
    senderId: "user-1",
    senderName: "Alice",
    content: id,
    type: MessageType.TEXT,
    status: MessageStatus.SENT,
    createdAt: new Date("2026-04-16T09:00:00.000Z"),
    isEdited: false,
    isDeleted: false,
    isPinned: false,
    isSystem: false,
  },
  isOwn: false,
  mergeLevel: "fully-merged",
  showAvatar: false,
  showSenderName: false,
  showMeta: false,
  showStatus: false,
  spacingToken: "tight",
  isGroupStart: false,
  isGroupEnd: false,
  conversationType: RoomType.GROUP,
  semanticFamily: "text",
  ...overrides,
});

describe("buildConversationThreadRows", () => {
  it("collapses consecutive grouped messages into one row", () => {
    const rows = buildConversationThreadRows([
      buildMessageItem("m1", {
        isGroupStart: true,
      }),
      buildMessageItem("m2", {
        isGroupEnd: true,
        showAvatar: true,
        showMeta: true,
        showStatus: true,
      }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "group",
      anchorMessageId: "m1",
      tailMessageId: "m2",
      showAvatar: true,
      showStatus: true,
    });
    if (rows[0].kind !== "group") {
      throw new Error("Expected a group row");
    }
    expect(rows[0].messageIds).toEqual(["m1", "m2"]);
  });

  it("preserves date and unread separators as standalone rows", () => {
    const rows = buildConversationThreadRows([
      {
        kind: "date",
        key: "date-1",
        date: new Date("2026-04-16T00:00:00.000Z"),
      },
      {
        kind: "unread",
        key: "unread-1",
      },
      buildMessageItem("m3", {
        isGroupStart: true,
        isGroupEnd: true,
      }),
    ]);

    expect(rows.map((row) => row.kind)).toEqual(["date", "unread", "group"]);
  });
});
