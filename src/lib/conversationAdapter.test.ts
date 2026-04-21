import { describe, expect, it } from "vitest";
import {
  isDirectConversation,
  normalizeConversation,
} from "./conversationAdapter";
import { RoomType, UserStatus } from "../types";

describe("isDirectConversation", () => {
  it("khong xep group 2 nguoi vao direct khi server tra type=group", () => {
    const result = isDirectConversation({
      type: RoomType.GROUP,
      participantCount: 2,
      participants: [
        {
          id: "u1",
          username: "u1",
          displayName: "U1",
          status: UserStatus.ONLINE,
        },
        {
          id: "u2",
          username: "u2",
          displayName: "U2",
          status: UserStatus.ONLINE,
        },
      ],
      otherUser: null,
    });

    expect(result).toBe(false);
  });

  it("xep dung direct khi server tra type=direct", () => {
    const result = isDirectConversation({
      type: RoomType.DIRECT,
      participantCount: 2,
      participants: [
        {
          id: "u1",
          username: "u1",
          displayName: "U1",
          status: UserStatus.ONLINE,
        },
        {
          id: "u2",
          username: "u2",
          displayName: "U2",
          status: UserStatus.ONLINE,
        },
      ],
      otherUser: {
        id: "u2",
        username: "u2",
        displayName: "U2",
        status: UserStatus.ONLINE,
      },
    });

    expect(result).toBe(true);
  });

  it("fallback theo otherUser khi payload thieu type", () => {
    const result = isDirectConversation({
      type: "legacy" as unknown as RoomType,
      participantCount: 1,
      participants: [
        {
          id: "u2",
          username: "u2",
          displayName: "U2",
          status: UserStatus.ONLINE,
        },
      ],
      otherUser: {
        id: "u2",
        username: "u2",
        displayName: "U2",
        status: UserStatus.ONLINE,
      },
    });

    expect(result).toBe(true);
  });
});

describe("normalizeConversation", () => {
  it("giu nguyen type direct/group tu payload sidebar", () => {
    const direct = normalizeConversation({
      id: "conv-direct",
      type: "direct",
      participants: [
        { id: "u1", username: "u1", displayName: "U1", status: "online" },
        { id: "u3", username: "u3", displayName: "U3", status: "online" },
      ],
      otherUser: {
        id: "u3",
        username: "u3",
        displayName: "U3",
        status: UserStatus.ONLINE,
      },
      updatedAt: "2026-04-07T04:17:18.629Z",
    });

    const group = normalizeConversation({
      id: "conv-group",
      type: "group",
      name: "Test nhom",
      participants: [
        { id: "u1", username: "u1", displayName: "U1", status: "online" },
        { id: "u3", username: "u3", displayName: "U3", status: "online" },
      ],
      updatedAt: "2026-04-07T04:17:18.629Z",
    });

    expect(direct?.type).toBe("direct");
    expect(group?.type).toBe("group");
  });

  it("normalize canonical summary fields from backend", () => {
    const conversation = normalizeConversation({
      id: "conv-1",
      conversationId: "conv-1",
      type: "group",
      name: "Realtime",
      unreadCount: 4,
      membershipState: "active",
      currentUserRole: "member",
      allowMemberMessaging: false,
      canCurrentUserSend: false,
      memberCount: 3,
      summaryVersion: 12,
      lastActivityAt: "2026-04-13T08:30:00.000Z",
      lastReadAt: "2026-04-13T08:00:00.000Z",
      lastReadMessageId: "msg-9",
      firstUnreadMessageId: "msg-10",
      firstUnreadMessageAt: "2026-04-13T08:30:00.000Z",
      lastMessage: {
        id: "msg-10",
        conversationId: "conv-1",
        senderId: "u2",
        senderName: "U2",
        content: "hello latest",
        type: "text",
        createdAt: "2026-04-13T08:30:00.000Z",
      },
      updatedAt: "2026-04-13T08:30:00.000Z",
    });

    expect(conversation?.unreadCount).toBe(4);
    expect(conversation?.membershipState).toBe("active");
    expect(conversation?.currentUserRole).toBe("member");
    expect(conversation?.allowMemberMessaging).toBe(false);
    expect(conversation?.canCurrentUserSend).toBe(false);
    expect(conversation?.summaryVersion).toBe(12);
    expect(conversation?.lastReadMessageId).toBe("msg-9");
    expect(conversation?.firstUnreadMessageId).toBe("msg-10");
    expect(conversation?.lastMessage?.id).toBe("msg-10");
    expect(conversation?.lastMessageId).toBe("msg-10");
    expect(conversation?.lastMessageSortAt).toEqual(
      new Date("2026-04-13T08:30:00.000Z"),
    );
    expect(conversation?.lastMessageStatus).toBe("sent");
  });
});
