import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SearchPanel } from "../../../components/chat/SearchPanel";
import { UserProfile } from "../../../components/info/UserProfile";
import { useAuthStore } from "../../../stores";

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
    getRelationshipState: () => ({
      kind: "self",
      capabilities: {},
    }),
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

describe("identity rendering surfaces", () => {
  beforeEach(() => {
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
});
