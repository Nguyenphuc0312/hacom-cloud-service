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
});
