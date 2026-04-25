import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RoomType, UserStatus, type Conversation, type UserSummary } from "../../types";
import { GroupAvatar } from "./GroupAvatar";

const currentUser: UserSummary = {
  id: "user-1",
  username: "user-1",
  displayName: "Current User",
  status: UserStatus.ONLINE,
};

const makeConversation = (
  overrides: Partial<Conversation> = {},
): Conversation =>
  ({
    id: "group-1",
    type: RoomType.GROUP,
    participantCount: 4,
    participants: [
      currentUser,
      {
        id: "user-2",
        username: "user-2",
        displayName: "Alice",
        avatar: "https://example.com/alice.png",
        status: UserStatus.ONLINE,
      },
      {
        id: "user-3",
        username: "user-3",
        displayName: "Bob",
        status: UserStatus.ONLINE,
      },
      {
        id: "user-4",
        username: "user-4",
        displayName: "Carol",
        avatar: "https://example.com/carol.png",
        status: UserStatus.OFFLINE,
      },
    ],
    updatedAt: new Date("2026-04-10T10:00:00.000Z"),
    unreadCount: 0,
    ...overrides,
  }) as Conversation;

describe("GroupAvatar", () => {
  it("renders explicit group avatar when the conversation has its own avatar", () => {
    render(
      <GroupAvatar
        conversation={makeConversation({
          name: "Architecture",
          avatar: "https://example.com/group.png",
        })}
        currentUserId="user-1"
      />,
    );

    expect(screen.getByLabelText("Architecture")).toHaveAttribute(
      "data-group-avatar-variant",
      "photo",
    );
  });

  it("renders a 2x2 mosaic for groups without a dedicated avatar", () => {
    render(
      <GroupAvatar
        conversation={makeConversation({
          name: "Realtime Guild",
          avatar: null,
          displayAvatar: null,
        })}
        currentUserId="user-1"
      />,
    );

    const avatar = screen.getByLabelText("Realtime Guild");
    expect(avatar).toHaveAttribute("data-group-avatar-variant", "mosaic");
    expect(
      avatar.querySelectorAll("[data-group-avatar-tile]").length,
    ).toBe(4);
  });

  it("keeps a balanced 2x2 layout for a three-member group without a dedicated avatar", () => {
    render(
      <GroupAvatar
        conversation={makeConversation({
          name: "",
          displayName: "",
          participantCount: 3,
          avatar: null,
          displayAvatar: null,
          participants: [
            currentUser,
            {
              id: "user-2",
              username: "user-2",
              displayName: "Alice",
              status: UserStatus.ONLINE,
            },
            {
              id: "user-3",
              username: "user-3",
              displayName: "Bob",
              status: UserStatus.OFFLINE,
            },
          ],
        })}
        currentUserId="user-1"
      />,
    );

    const avatar = screen.getByLabelText("Alice, Bob");
    expect(avatar).toHaveAttribute("data-group-avatar-variant", "mosaic");
    expect(
      avatar.querySelectorAll('[data-group-avatar-tile="initials"]').length,
    ).toBe(2);
    expect(
      avatar.querySelectorAll('[data-group-avatar-tile="empty"]').length,
    ).toBe(2);
  });

  it("keeps the mosaic bounded to four tiles for large groups without member photos", () => {
    const participants = [
      currentUser,
      ...Array.from({ length: 10 }, (_, index) => ({
        id: `user-${index + 2}`,
        username: `user-${index + 2}`,
        displayName: `Member ${index + 2}`,
        status: index % 2 === 0 ? UserStatus.ONLINE : UserStatus.OFFLINE,
      })),
    ];

    render(
      <GroupAvatar
        conversation={makeConversation({
          name: "Large group",
          participantCount: 11,
          participants: participants as Conversation["participants"],
          avatar: null,
          displayAvatar: null,
        })}
        currentUserId="user-1"
      />,
    );

    const avatar = screen.getByLabelText("Large group");
    expect(avatar).toHaveAttribute("data-group-avatar-variant", "mosaic");
    expect(
      avatar.querySelectorAll('[data-group-avatar-tile="initials"]').length,
    ).toBe(4);
  });
});
