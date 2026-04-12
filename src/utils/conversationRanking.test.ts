import { describe, expect, it } from "vitest";
import { RoomType, UserStatus, type Conversation } from "../types";
import {
  getConversationRankBreakdown,
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
});
