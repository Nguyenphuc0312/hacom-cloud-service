import { describe, expect, it } from "vitest";
import { MessageType, RoomType, UserStatus, type Conversation } from "../types";
import {
  getConversationRankBreakdown,
  rankConversations,
  sortConversationsByActivity,
} from "./conversationRanking";

const makeConversation = (
  id: string,
  updatedAt: string,
  overrides: Partial<Conversation> = {},
): Conversation =>
  ({
    id,
    type: RoomType.DIRECT,
    participantCount: 2,
    participants: [
      {
        id: "user-1",
        username: "user-1",
        displayName: "User 1",
        status: UserStatus.ONLINE,
      },
      {
        id: "user-2",
        username: "user-2",
        displayName: "User 2",
        status: UserStatus.ONLINE,
      },
    ],
    updatedAt,
    unreadCount: 0,
    ...overrides,
  }) as Conversation;

describe("sortConversationsByActivity", () => {
  it("sorts conversations by latest activity timestamp descending", () => {
    const conversations = [
      makeConversation("older", "2026-04-10T09:00:00.000Z"),
      makeConversation("newest", "2026-04-10T11:00:00.000Z"),
      makeConversation("middle", "2026-04-10T10:00:00.000Z"),
    ];

    expect(sortConversationsByActivity(conversations).map((item) => item.id)).toEqual([
      "newest",
      "middle",
      "older",
    ]);
  });

  it("does not float the active conversation to the top when only rank context changes", () => {
    const older = makeConversation("older", "2026-04-10T09:00:00.000Z");
    const newer = makeConversation("newer", "2026-04-10T10:00:00.000Z");

    expect(
      getConversationRankBreakdown(older, {
        activeConversationId: "older",
      }).active,
    ).toBeGreaterThan(0);

    expect(sortConversationsByActivity([older, newer]).map((item) => item.id)).toEqual([
      "newer",
      "older",
    ]);
  });

  it("reorders conversations when a system message becomes the latest activity", () => {
    const older = makeConversation("older", "2026-04-10T09:00:00.000Z");
    const groupUpdated = makeConversation(
      "group-updated",
      "2026-04-10T08:00:00.000Z",
      {
        type: RoomType.GROUP,
        lastMessage: {
          id: "sys-1",
          senderId: "system",
          senderName: "System",
          content: "Alice đã thêm Bob vào nhóm",
          type: MessageType.SYSTEM,
          isDeleted: false,
          createdAt: new Date("2026-04-10T11:30:00.000Z"),
        },
      },
    );

    expect(
      sortConversationsByActivity([older, groupUpdated]).map((item) => item.id),
    ).toEqual(["group-updated", "older"]);
  });

  it("ignores updatedAt-only changes when canonical lastMessageSortAt is older", () => {
    const canonicalNewer = makeConversation("canonical-newer", "2026-04-10T11:00:00.000Z", {
      lastMessageSortAt: "2026-04-10T11:00:00.000Z",
    });
    const metadataTouched = makeConversation("metadata-touched", "2026-04-10T12:00:00.000Z", {
      lastMessageSortAt: "2026-04-10T09:00:00.000Z",
    });

    expect(
      sortConversationsByActivity([metadataTouched, canonicalNewer]).map((item) => item.id),
    ).toEqual(["canonical-newer", "metadata-touched"]);
  });

  it("does not let active or unread signals change sidebar ordering", () => {
    const older = makeConversation("older", "2026-04-10T09:00:00.000Z", {
      unreadCount: 12,
      lastMessageSortAt: "2026-04-10T09:00:00.000Z",
    });
    const newer = makeConversation("newer", "2026-04-10T10:00:00.000Z", {
      unreadCount: 0,
      lastMessageSortAt: "2026-04-10T10:00:00.000Z",
    });

    expect(
      rankConversations([older, newer], {
        activeConversationId: "older",
        currentUserId: "user-1",
      }).map((item) => item.id),
    ).toEqual(["newer", "older"]);
  });
});
