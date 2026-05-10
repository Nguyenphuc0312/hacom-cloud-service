import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import NotificationPanel from "./NotificationPanel";
import { useChatStore } from "../../stores/chatStore";
import { useNotificationStore } from "../../features/notification/state/notificationStore";
import { MessageType, RoomType, UserStatus, type Conversation } from "../../types";

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: { defaultValue?: string; count?: number }) => {
        if (options?.defaultValue) {
          return options.defaultValue.replace(
            "{{count}}",
            String(options.count ?? ""),
          );
        }
        return key;
      },
    }),
  };
});

const makeConversation = (overrides: Partial<Conversation> = {}): Conversation =>
  ({
    id: "room-unread",
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
        id: "user-2",
        username: "user-2",
        displayName: "Unread Room",
        status: UserStatus.ONLINE,
      },
    ],
    displayName: "Unread Room",
    updatedAt: new Date("2026-04-16T09:00:00.000Z"),
    unreadCount: 2,
    lastMessage: {
      id: "msg-latest",
      senderId: "user-2",
      senderName: "User Two",
      content: "Newest unread message",
      type: MessageType.TEXT,
      createdAt: new Date("2026-04-16T09:00:00.000Z"),
      isDeleted: false,
    },
    ...overrides,
  }) as Conversation;

describe("NotificationPanel", () => {
  beforeEach(() => {
    useChatStore.getState().reset();
    useNotificationStore.getState().reset();
  });

  it("renders durable unread conversations even when the transient notification store is empty", () => {
    useChatStore.getState().setConversations([makeConversation()]);

    render(
      <MemoryRouter>
        <NotificationPanel isOpen onClose={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("dialog", { name: "Notifications" })).toBeInTheDocument();
    expect(screen.getByText("Unread Room")).toBeInTheDocument();
    expect(screen.getByText("Newest unread message")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Mark read" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear" })).toBeDisabled();
  });
});
