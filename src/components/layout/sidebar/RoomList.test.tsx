import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MessageType, RoomType, UserStatus, type Conversation } from "../../../types";
import type { UserSummary } from "../../../types";
import { RoomList } from "./RoomList";

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: { defaultValue?: string }) =>
        options?.defaultValue ?? key,
    }),
  };
});

const currentUser: UserSummary = {
  id: "user-1",
  username: "user-1",
  displayName: "User One",
  status: UserStatus.ONLINE,
};

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
      currentUser,
      {
        id: `${id}-peer`,
        username: `${id}-peer`,
        displayName: `${id} peer`,
        status: UserStatus.ONLINE,
      },
    ],
    updatedAt: new Date(updatedAt),
    unreadCount: 0,
    ...overrides,
  }) as Conversation;

describe("RoomList", () => {
  it("keeps one global activity order across direct and group conversations", () => {
    const directConversation = makeConversation(
      "direct-older",
      "2026-04-10T09:00:00.000Z",
      {
        type: RoomType.DIRECT,
        displayName: "Older direct",
        otherUser: {
          id: "user-2",
          username: "user-2",
          displayName: "Older direct",
          status: UserStatus.ONLINE,
        },
        lastMessageSortAt: "2026-04-10T09:00:00.000Z",
        lastMessageAt: "2026-04-10T09:00:00.000Z",
        lastMessage: {
          id: "msg-direct",
          senderId: "user-2",
          senderName: "Older direct",
          content: "older",
          type: MessageType.TEXT,
          createdAt: new Date("2026-04-10T09:00:00.000Z"),
          isDeleted: false,
        },
      },
    );

    const groupConversation = makeConversation(
      "group-newer",
      "2026-04-10T10:00:00.000Z",
      {
        type: RoomType.GROUP,
        name: "Newer group",
        participantCount: 3,
        participants: [
          currentUser,
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
            status: UserStatus.ONLINE,
          },
        ],
        lastMessageSortAt: "2026-04-10T10:00:00.000Z",
        lastMessageAt: "2026-04-10T10:00:00.000Z",
        lastMessage: {
          id: "msg-group",
          senderId: "user-3",
          senderName: "Bob",
          content: "newer",
          type: MessageType.TEXT,
          createdAt: new Date("2026-04-10T10:00:00.000Z"),
          isDeleted: false,
        },
      },
    );

    render(
      <RoomList
        conversations={[directConversation, groupConversation]}
        currentUser={currentUser}
        selectedId={null}
        searchQuery=""
        collapsed={false}
        onSelect={vi.fn()}
      />,
    );

    const roomOptions = screen.getAllByRole("option");
    expect(roomOptions).toHaveLength(2);
    expect(roomOptions[0]).toHaveAccessibleName("Newer group");
    expect(roomOptions[1]).toHaveAccessibleName("Older direct");
  });
});
