import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SearchPanel } from "../../../components/chat/SearchPanel";
import { UserProfile } from "../../../components/info/UserProfile";
import { useAuthStore } from "../../../stores";

const { getRelationshipStateMock } = vi.hoisted(() => ({
  getRelationshipStateMock: vi.fn(),
}));

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
    }),
  };
});

vi.mock("../../../hooks/useMessageSearch", () => ({
  useMessageSearch: () => ({
    query: "hello",
    setQuery: vi.fn(),
    results: [
      {
        id: "m-1",
        senderAvatar: null,
        senderName: " ",
        senderId: "emp001",
        createdAt: "2026-04-12T10:00:00.000Z",
        content: "hello there",
      },
    ],
    total: 1,
    isLoading: false,
    error: null,
    hasMore: false,
    loadMore: vi.fn(),
    reset: vi.fn(),
  }),
}));

vi.mock("../../../hooks/useFriendship", () => ({
  useFriendship: () => ({
    refreshDirectory: vi.fn(),
    getRelationshipState: getRelationshipStateMock,
    sendFriendRequest: vi.fn(),
    acceptFriendRequest: vi.fn(),
    rejectFriendRequest: vi.fn(),
    cancelFriendRequest: vi.fn(),
    removeFriend: vi.fn(),
    blockUser: vi.fn(),
    unblockUser: vi.fn(),
  }),
}));

vi.mock("../../../hooks/usePresence", () => ({
  usePresence: vi.fn(),
}));

vi.mock("../../../features/chat/usecases/getUserById", () => ({
  getUserByIdUseCase: vi.fn().mockResolvedValue({
    success: true,
    data: {
      id: "user-2",
      username: "user-2",
      displayName: "Tran Thi B",
      avatar: null,
      status: "offline",
    },
  }),
}));

describe("identity rendering surfaces", () => {
  beforeEach(() => {
    getRelationshipStateMock.mockReturnValue({
      kind: "self",
      capabilities: {},
    });

    useAuthStore.setState((state) => ({
      ...state,
      user: {
        id: "user-1",
        username: "user-1",
        fullNameFromHR: "Nguyen Van A",
        employeeCode: "EMP001",
      },
      isAuthenticated: true,
      authStatus: "authenticated",
    }));
  });

  it("renders fallback identity in search results", () => {
    render(
      <SearchPanel
        conversationId="c-1"
        onSelectMessage={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("emp001")).toBeInTheDocument();
  });

  it("renders HR name in user profile card when display name is absent", () => {
    render(
      <UserProfile
        userId="user-1"
        currentUserId="user-1"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Nguyen Van A")).toBeInTheDocument();
    expect(screen.getByText("@user-1")).toBeInTheDocument();
  });

  it("hides the message action when viewing someone inside an active direct conversation", () => {
    getRelationshipStateMock.mockReturnValue({
      kind: "friend",
      friendshipId: "friendship-1",
      capabilities: {
        canMessage: true,
        canUnfriend: true,
        canBlock: true,
      },
    });

    render(
      <UserProfile
        userId="user-2"
        currentUserId="user-1"
        initialUser={{
          id: "user-2",
          username: "user-2",
          displayName: "Tran Thi B",
        }}
        onClose={vi.fn()}
        onStartConversation={vi.fn()}
        conversationContext="direct"
      />,
    );

    expect(
      screen.queryByRole("button", { name: "friends:message" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "friends:unfriend" }),
    ).toBeInTheDocument();
  });

  it("keeps the message action when viewing someone outside the active direct chat", () => {
    getRelationshipStateMock.mockReturnValue({
      kind: "friend",
      friendshipId: "friendship-1",
      capabilities: {
        canMessage: true,
        canUnfriend: false,
        canBlock: true,
      },
    });

    render(
      <UserProfile
        userId="user-2"
        currentUserId="user-1"
        initialUser={{
          id: "user-2",
          username: "user-2",
          displayName: "Tran Thi B",
        }}
        onClose={vi.fn()}
        onStartConversation={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "friends:message" }),
    ).toBeInTheDocument();
  });
});
