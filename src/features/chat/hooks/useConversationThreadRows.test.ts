import { describe, expect, it } from "vitest";
import type { Message } from "../../../types";
import { RoomType } from "../../../types";
import { buildTimelineItems } from "../../../utils/timelinePlanner";
import {
  buildConversationThreadRows,
  type ConversationThreadMessageItem,
} from "./useConversationThreadRows";

const makeMessage = (index: number): Message =>
  ({
    id: "message-" + index,
    conversationId: "conversation-1",
    senderId: "sender-1",
    senderName: "Sender",
    content: "Message " + index,
    type: "text",
    status: "sent",
    createdAt: new Date(Date.UTC(2026, 7, 25, 8, 0, index)),
    attachments: [],
    reactions: [],
    readBy: [],
    mentions: [],
  }) as Message;

describe("buildConversationThreadRows", () => {
  it("caps virtual rows while preserving one visual message group", () => {
    const messages = Array.from({ length: 20 }, (_, index) => makeMessage(index));
    const timelineItems = buildTimelineItems({
      messages,
      currentUserId: "viewer",
      conversationType: RoomType.GROUP,
      groupingThresholdMs: 45_000,
    });
    const conversationItems = timelineItems.map((item) =>
      item.kind === "message" || item.kind === "system"
        ? { ...item, messageId: item.message.id }
        : item,
    ) as Array<
      ConversationThreadMessageItem |
      Exclude<(typeof timelineItems)[number], { kind: "message" | "system" }>
    >;
    const groupRows = buildConversationThreadRows(conversationItems).filter(
      (row) => row.kind === "group",
    );

    expect(groupRows.map((row) => row.items.length)).toEqual([6, 6, 6, 2]);
    expect(groupRows.map((row) => row.groupItemOffset)).toEqual([0, 6, 12, 18]);
    expect(groupRows.every((row) => row.groupItemCount === messages.length)).toBe(true);
    expect(groupRows.flatMap((row) => row.messageIds)).toEqual(
      messages.map((message) => message.id),
    );
  });
});
