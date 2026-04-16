import { beforeEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { MessageStatus, MessageType, RoomType, UserStatus } from "../../../types";
import type { UserSummary } from "../../../types";
import { useChatStore } from "../../../stores";
import { useSidebarConversationList } from "./useSidebarConversationList";

const currentUser: UserSummary = {
  id: "user-1",
  username: "user-1",
  displayName: "User One",
  status: UserStatus.ONLINE,
};

const makeConversation = (
  id: string,
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> => ({
  id,
  conversationId: id,
  type: RoomType.DIRECT,
  displayName: id,
  name: id,
  participantCount: 2,
  participants: [
    currentUser,
    {
      id: `${id}-peer`,
      username: `${id}-peer`,
      displayName: `${id} peer`,
      status: UserStatus.ONLINE,
    },
  ],
  otherUser: {
    id: `${id}-peer`,
    username: `${id}-peer`,
    displayName: `${id} peer`,
    status: UserStatus.ONLINE,
  },
  unreadCount: 0,
  summaryVersion: 1,
  membershipState: "active",
  lastActivityAt: "2026-04-10T09:00:00.000Z",
  updatedAt: "2026-04-10T09:00:00.000Z",
  createdAt: "2026-04-10T09:00:00.000Z",
  ...overrides,
});

const makeMessage = (
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> => ({
  id: "msg-1",
  conversationId: "room-1",
  senderId: "user-2",
  senderName: "Alice",
  content: "Hello",
  type: MessageType.TEXT,
  status: MessageStatus.SENT,
  isDeleted: false,
  createdAt: "2026-04-10T09:00:00.000Z",
  updatedAt: "2026-04-10T09:00:00.000Z",
  ...overrides,
});

describe("useSidebarConversationList", () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  it("returns stable ordered items and aggregate counts from the canonical conversation store", () => {
    useChatStore.getState().setConversations([
      makeConversation("direct-older", {
        type: RoomType.DIRECT,
        displayName: "Older direct",
        unreadCount: 1,
        lastActivityAt: "2026-04-10T09:00:00.000Z",
        updatedAt: "2026-04-10T09:00:00.000Z",
        lastMessage: makeMessage({
          id: "msg-direct",
          conversationId: "direct-older",
          senderId: "direct-older-peer",
          senderName: "Older direct",
          content: "Older preview",
          createdAt: "2026-04-10T09:00:00.000Z",
        }),
      }),
      makeConversation("group-newer", {
        type: RoomType.GROUP,
        name: "Product squad",
        displayName: "Product squad",
        participantCount: 4,
        participants: [
          currentUser,
          {
            id: "user-2",
            username: "alice",
            displayName: "Alice",
            status: UserStatus.ONLINE,
          },
          {
            id: "user-3",
            username: "bob",
            displayName: "Bob",
            status: UserStatus.ONLINE,
          },
          {
            id: "user-4",
            username: "carol",
            displayName: "Carol",
            status: UserStatus.OFFLINE,
          },
        ],
        unreadCount: 3,
        lastActivityAt: "2026-04-10T10:00:00.000Z",
        updatedAt: "2026-04-10T10:00:00.000Z",
        lastMessage: makeMessage({
          id: "msg-group",
          conversationId: "group-newer",
          senderId: "user-3",
          senderName: "Bob",
          content: "Sprint plan updated",
          createdAt: "2026-04-10T10:00:00.000Z",
        }),
      }),
      makeConversation("direct-quiet", {
        type: RoomType.DIRECT,
        displayName: "Quiet room",
        unreadCount: 0,
        lastActivityAt: "2026-04-10T08:00:00.000Z",
        updatedAt: "2026-04-10T08:00:00.000Z",
      }),
    ] as never);

    const { result } = renderHook(() =>
      useSidebarConversationList(currentUser, {
        filter: "all",
        query: "",
      }),
    );

    expect(result.current.counts).toEqual({
      all: 3,
      unread: 2,
      groups: 1,
    });
    expect(result.current.items.map((item) => item.id)).toEqual([
      "group-newer",
      "direct-older",
      "direct-quiet",
    ]);
    expect(result.current.items[0]?.displayName).toBe("Product squad");
    expect(result.current.items[0]?.previewText).toContain("Bob:");
    expect(result.current.items[1]?.previewText).toBe("Older preview");
    expect(result.current.items[1]?.directPartnerId).toBe("direct-older-peer");
  });

  it("applies unread and group filters after query matching without re-sorting in the view layer", () => {
    useChatStore.getState().setConversations([
      makeConversation("alpha-direct", {
        type: RoomType.DIRECT,
        displayName: "Alpha direct",
        unreadCount: 0,
        lastActivityAt: "2026-04-10T09:00:00.000Z",
        updatedAt: "2026-04-10T09:00:00.000Z",
        lastMessage: makeMessage({
          id: "msg-alpha",
          conversationId: "alpha-direct",
          senderId: "alpha-direct-peer",
          senderName: "Alpha direct",
          content: "alpha preview",
        }),
      }),
      makeConversation("beta-group", {
        type: RoomType.GROUP,
        name: "Beta guild",
        displayName: "Beta guild",
        participantCount: 3,
        participants: [
          currentUser,
          {
            id: "user-2",
            username: "beta-alice",
            displayName: "Alice Beta",
            status: UserStatus.ONLINE,
          },
          {
            id: "user-3",
            username: "beta-bob",
            displayName: "Bob Beta",
            status: UserStatus.ONLINE,
          },
        ],
        unreadCount: 5,
        lastActivityAt: "2026-04-10T10:30:00.000Z",
        updatedAt: "2026-04-10T10:30:00.000Z",
        lastMessage: makeMessage({
          id: "msg-beta",
          conversationId: "beta-group",
          senderId: "user-2",
          senderName: "Alice Beta",
          content: "Need beta review",
          createdAt: "2026-04-10T10:30:00.000Z",
        }),
      }),
    ] as never);

    const groupsByName = renderHook(() =>
      useSidebarConversationList(currentUser, {
        filter: "groups",
        query: "beta",
      }),
    );
    const unreadByPreview = renderHook(() =>
      useSidebarConversationList(currentUser, {
        filter: "unread",
        query: "review",
      }),
    );
    const groupsNoMatch = renderHook(() =>
      useSidebarConversationList(currentUser, {
        filter: "groups",
        query: "alpha",
      }),
    );

    expect(groupsByName.result.current.items.map((item) => item.id)).toEqual([
      "beta-group",
    ]);
    expect(groupsByName.result.current.items[0]?.unreadCount).toBe(5);
    expect(unreadByPreview.result.current.items.map((item) => item.id)).toEqual([
      "beta-group",
    ]);
    expect(groupsNoMatch.result.current.items).toEqual([]);
  });
});
