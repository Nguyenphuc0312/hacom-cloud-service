import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Message, UserSummary } from "../../../types";
import { GlobalSearchOverlay } from "./GlobalSearchOverlay";

const mocks = vi.hoisted(() => {
  const friend = {
    id: "friend",
    username: "friend",
    displayName: "Nguyễn Minh Quang",
    avatar: null,
  };

  return {
    friend,
    conversationById: {
      "direct-1": {
        id: "direct-1",
        type: "direct",
        participants: [
          { id: "me", username: "me", displayName: "Tôi" },
          friend,
        ],
      },
      "group-1": {
        id: "group-1",
        type: "group",
        name: "Đội IT - VP TCT",
        participants: [
          { id: "me", username: "me", displayName: "Tôi" },
          friend,
        ],
      },
    },
    friendByUserId: {
      friend: { ...friend, alias: "VPTCT-Nguyễn Minh Quang" },
    },
  };
});

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: vi.fn() },
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "sidebar:globalSearch.placeholder": "Tìm liên hệ, tin nhắn, file",
        "sidebar:globalSearch.aria": "Tìm liên hệ, tin nhắn và file",
        "common:labels.conversation": "Cuộc trò chuyện",
        "chat:message.you": "Bạn",
      })[key] ?? key,
  }),
}));

vi.mock("../../../stores", () => ({
  useChatStore: (selector: (state: unknown) => unknown) =>
    selector({ conversationById: mocks.conversationById }),
  useFriendshipStore: (selector: (state: unknown) => unknown) =>
    selector({ friendByUserId: mocks.friendByUserId }),
}));

vi.mock("../../../stores/enrichedProfileStore", () => ({
  useEnrichedProfileStore: (selector: (state: unknown) => unknown) =>
    selector({ nameByUserId: { friend: "Nguyễn Minh Quang" } }),
}));

vi.mock("../../../features/chat/events/chatUiEvents", () => ({
  dispatchOpenConversation: vi.fn(),
  dispatchStartDirectMessage: vi.fn(),
}));

vi.mock("../../../features/chat/hooks/useGlobalSearch", () => ({
  useGlobalContactSearch: () => ({ people: [], isLoading: false }),
  useGlobalGroupSearch: () => [],
  useGlobalMessageSearch: () => ({
    messages: [
      {
        id: "message-direct",
        conversationId: "direct-1",
        senderId: "friend",
        senderName: "Nguyễn Minh Quang",
        content: "Bộ phận Chuyển đổi số",
        type: "text",
        createdAt: "2026-09-04T07:00:00.000Z",
      },
      {
        id: "message-group",
        conversationId: "group-1",
        senderId: "friend",
        senderName: "Nguyễn Minh Quang",
        content: "Quang xong rồi anh",
        type: "text",
        createdAt: "2026-09-04T06:00:00.000Z",
      },
    ] as Message[],
    isLoading: false,
    error: null,
    hasMore: false,
    loadMore: vi.fn(),
  }),
  useGlobalFileSearch: () => ({
    files: [
      {
        conversationId: "direct-1",
        conversationName: "Nguyễn Minh Quang",
        messageId: "message-file",
        fileId: "file-1",
        fileName: "BAO-CAO-CONG-VIEC.xlsx",
        mimeType: "application/vnd.ms-excel",
        sizeBytes: 1024,
        senderId: "friend",
        senderName: "Nguyễn Minh Quang",
        senderAvatarUrl: null,
        createdAt: "2026-09-03T07:00:00.000Z",
      },
    ],
    isLoading: false,
  }),
  useConversationSenders: () => [mocks.friend],
}));

describe("GlobalSearchOverlay", () => {
  it("closes when Escape is pressed", () => {
    const onClose = vi.fn();

    render(
      <GlobalSearchOverlay
        currentUser={
          { id: "me", username: "me", displayName: "Tôi" } as UserSummary
        }
        query=""
        onQueryChange={vi.fn()}
        onClose={onClose}
      />,
    );

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows aliases and the conversation containing each result", () => {
    render(
      <GlobalSearchOverlay
        currentUser={
          { id: "me", username: "me", displayName: "Tôi" } as UserSummary
        }
        query="Quang"
        onQueryChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("textbox", {
        name: "Tìm liên hệ, tin nhắn và file",
      }),
    ).toHaveAttribute("placeholder", "Tìm liên hệ, tin nhắn, file");

    expect(screen.getByTitle("VPTCT-Nguyễn Minh Quang")).toBeInTheDocument();
    expect(screen.getByText("Bộ phận Chuyển đổi số")).toBeInTheDocument();
    expect(screen.getByTitle("Đội IT - VP TCT")).toBeInTheDocument();
    expect(screen.getByText("VPTCT-Nguyễn Minh Quang:")).toBeInTheDocument();

    const fileContext = screen.getByTitle(
      /^VPTCT-Nguyễn Minh Quang · 1\.0 KB$/,
    );
    expect(fileContext).toHaveTextContent("VPTCT-Nguyễn Minh Quang · 1.0 KB");
    expect(fileContext).not.toHaveTextContent("direct-1");
  });
});
