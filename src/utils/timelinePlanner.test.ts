import { describe, expect, it } from "vitest";

import { MessageType, RoomType, type Message } from "../types";
import { buildTimelineItems } from "./timelinePlanner";

const makeMessage = (
  id: string,
  createdAt: string,
  overrides: Partial<Message> = {},
): Message =>
  ({
    id,
    stableId: id,
    conversationId: "room-1",
    senderId: "user-2",
    senderName: "User 2",
    content: `message-${id}`,
    type: MessageType.TEXT,
    status: "sent",
    isEdited: false,
    isPinned: false,
    isDeleted: false,
    isSystem: false,
    createdAt: new Date(createdAt),
    ...overrides,
  }) as Message;

describe("timelinePlanner unread markers", () => {
  it("inserts an unread divider before the first unread live message", () => {
    const messages = [
      makeMessage("m-1", "2026-04-15T10:00:00.000Z"),
      makeMessage("m-2", "2026-04-15T10:01:00.000Z"),
      makeMessage("m-3", "2026-04-15T10:02:00.000Z"),
    ];

    const items = buildTimelineItems({
      messages,
      currentUserId: "user-1",
      conversationType: RoomType.DIRECT,
      groupingThresholdMs: 45_000,
      unreadMarker: {
        firstUnreadMessageId: "m-3",
        active: true,
      },
    });

    const unreadIndex = items.findIndex((item) => item.kind === "unread");
    const firstUnreadMessageIndex = items.findIndex(
      (item) => item.kind === "message" && item.message.id === "m-3",
    );

    expect(unreadIndex).toBeGreaterThan(-1);
    expect(firstUnreadMessageIndex).toBeGreaterThan(unreadIndex);
    expect(items[unreadIndex + 1]).toMatchObject({
      kind: "message",
      message: { id: "m-3" },
    });
  });
});
