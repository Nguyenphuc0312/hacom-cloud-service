import { describe, expect, it } from "vitest";

import { FileType, MessageType, RoomType, type Message } from "../types";
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

  it("fully merges consecutive text messages from the same sender and only shows meta on the cluster tail", () => {
    const messages = [
      makeMessage("m-1", "2026-04-15T10:00:00.000Z"),
      makeMessage("m-2", "2026-04-15T10:00:18.000Z"),
    ];

    const items = buildTimelineItems({
      messages,
      currentUserId: "user-1",
      conversationType: RoomType.GROUP,
      groupingThresholdMs: 45_000,
    });

    const messageItems = items.filter(
      (item): item is Extract<(typeof items)[number], { kind: "message" }> =>
        item.kind === "message",
    );

    expect(messageItems).toHaveLength(2);
    expect(messageItems[0]).toMatchObject({
      mergeLevel: "fully-merged",
      showSenderName: true,
      showAvatar: false,
      showMeta: false,
      spacingToken: "tight",
    });
    expect(messageItems[1]).toMatchObject({
      mergeLevel: "fully-merged",
      showSenderName: false,
      showAvatar: true,
      showMeta: true,
      spacingToken: "cluster",
    });
  });

  it("keeps reply and media messages semantically merged without hard-breaking the cluster", () => {
    const messages = [
      makeMessage("m-1", "2026-04-15T10:00:00.000Z"),
      makeMessage("m-2", "2026-04-15T10:00:22.000Z", {
        replyTo: "seed-message",
      }),
      makeMessage("m-3", "2026-04-15T10:00:35.000Z", {
        type: MessageType.IMAGE,
        attachments: [
          {
            id: "att-1",
            type: FileType.IMAGE,
            fileName: "photo.png",
          },
        ],
      }),
    ];

    const items = buildTimelineItems({
      messages,
      currentUserId: "user-1",
      conversationType: RoomType.DIRECT,
      groupingThresholdMs: 45_000,
    });

    const messageItems = items.filter(
      (item): item is Extract<(typeof items)[number], { kind: "message" }> =>
        item.kind === "message",
    );

    expect(messageItems.map((item) => item.mergeLevel)).toEqual([
      "semantically-merged",
      "semantically-merged",
      "semantically-merged",
    ]);
    expect(messageItems.map((item) => item.spacingToken)).toEqual([
      "related",
      "related",
      "cluster",
    ]);
    expect(messageItems.every((item) => item.showAvatar === false)).toBe(true);
  });

  it("hard-breaks clusters when the sender changes", () => {
    const messages = [
      makeMessage("m-1", "2026-04-15T10:00:00.000Z"),
      makeMessage("m-2", "2026-04-15T10:00:10.000Z", {
        senderId: "user-3",
        senderName: "User 3",
      }),
    ];

    const items = buildTimelineItems({
      messages,
      currentUserId: "user-1",
      conversationType: RoomType.GROUP,
      groupingThresholdMs: 45_000,
    });

    const messageItems = items.filter(
      (item): item is Extract<(typeof items)[number], { kind: "message" }> =>
        item.kind === "message",
    );

    expect(messageItems[0]).toMatchObject({
      mergeLevel: "not-merged",
      showMeta: true,
      spacingToken: "cluster",
    });
    expect(messageItems[1]).toMatchObject({
      mergeLevel: "not-merged",
      showMeta: true,
      showSenderName: true,
    });
  });
});
