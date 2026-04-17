import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MessageType,
  RoomType,
  type UserSummary,
  UserStatus,
  type Conversation,
} from "../../../types";
import { RoomList } from "./RoomList";
import { useChatStore } from "../../../stores";

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
        displayName: "User One",
        status: UserStatus.ONLINE,
      },
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

const currentUser: UserSummary = {
  id: "user-1",
  username: "user-1",
  displayName: "User One",
  status: UserStatus.ONLINE,
};

describe("RoomList", () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  it("renders room items in the supplied selector order", () => {
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
      },
    );

    const groupConversation = makeConversation(
      "group-newer",
      "2026-04-10T10:00:00.000Z",
      {
        type: RoomType.GROUP,
        name: "Newer group",
        participantCount: 3,
      },
    );

    useChatStore.getState().setConversations([
      directConversation,
      groupConversation,
    ]);

    render(
      <RoomList
        layoutState="normal"
        conversationIds={[groupConversation.id, directConversation.id]}
        currentUser={currentUser}
        selectedId={null}
        searchQuery=""
        onSelect={vi.fn()}
      />,
    );

    const roomOptions = screen.getAllByRole("option");
    expect(roomOptions).toHaveLength(2);
    expect(roomOptions[0]).toHaveAccessibleName("Newer group");
    expect(roomOptions[1]).toHaveAccessibleName("Older direct");
  });

  it("renders a clearer unnamed group fallback with mosaic identity and sender-prefixed preview", () => {
    const unnamedGroup = makeConversation(
      "group-fallback",
      "2026-04-10T10:00:00.000Z",
      {
        type: RoomType.GROUP,
        name: "",
        displayName: "",
        avatar: null,
        displayAvatar: null,
        participantCount: 6,
        participants: [
          {
            id: "user-1",
            username: "user-1",
            displayName: "User One",
            status: UserStatus.ONLINE,
          },
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
            status: UserStatus.ONLINE,
          },
          {
            id: "user-5",
            username: "user-5",
            displayName: "Dave",
            status: UserStatus.OFFLINE,
          },
          {
            id: "user-6",
            username: "user-6",
            displayName: "Eve",
            status: UserStatus.ONLINE,
          },
        ],
        lastMessage: {
          id: "msg-group-long",
          senderId: "user-3",
          senderName: "Bob",
          content:
            "This is a very long preview message that should still keep the sender prefix visible in the sidebar item",
          type: MessageType.TEXT,
          createdAt: new Date("2026-04-10T10:00:00.000Z"),
          isDeleted: false,
        },
      },
    );

    useChatStore.getState().setConversations([unnamedGroup]);

    render(
      <RoomList
        layoutState="normal"
        conversationIds={[unnamedGroup.id]}
        currentUser={currentUser}
        selectedId={null}
        searchQuery=""
        onSelect={vi.fn()}
      />,
    );

    const roomOption = screen.getByRole("option", {
      name: "Alice, Bob +3",
    });
    expect(
      roomOption.querySelector('[data-group-avatar-variant="mosaic"]'),
    ).not.toBeNull();
    expect(screen.getByText(/^Bob: This is a very long preview/)).toBeInTheDocument();
  });
});
