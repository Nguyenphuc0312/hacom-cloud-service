import "@testing-library/jest-dom/vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import {
  createMemoryRouter,
  RouterProvider,
} from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useChatSidebarStore } from "../features/chat/state/chatSidebarStore";
import { AuthenticatedLayout } from "./AuthenticatedLayout";

const mocks = vi.hoisted(() => ({
  checkReminder: vi.fn(),
  fetchFriends: vi.fn(),
  notificationClickHandler: null as null | ((detail: {
    conversationId?: string;
    messageId?: string;
  }) => void),
}));

vi.mock("../components/layout/CommandPalette", () => ({
  CommandPalette: () => null,
}));

vi.mock("../shared/layout", () => ({
  PersistentNavigationRail: () => <nav aria-label="Điều hướng" />,
}));

vi.mock("../features/realtime/GlobalWebSocketProvider", () => ({
  GlobalWebSocketProvider: ({ children }: PropsWithChildren) => children,
}));

vi.mock("../stores", () => ({
  useAuthStore: (selector: (state: { user: null }) => unknown) =>
    selector({ user: null }),
}));

vi.mock("../stores/reminderStore", () => ({
  useReminderStore: (
    selector: (state: { checkReminder: typeof mocks.checkReminder }) => unknown,
  ) => selector({ checkReminder: mocks.checkReminder }),
}));

vi.mock("../stores/friendshipStore", () => ({
  useFriendshipStore: {
    getState: () => ({
      hasHydrated: true,
      fetchFriends: mocks.fetchFriends,
    }),
  },
}));

vi.mock("../features/chat/events/chatUiEvents", () => ({
  createChatRouteState: vi.fn((intent) => ({ chatIntent: intent })),
  listenForNotificationClick: (handler: typeof mocks.notificationClickHandler) => {
    mocks.notificationClickHandler = handler;
    return () => {
      if (mocks.notificationClickHandler === handler) {
        mocks.notificationClickHandler = null;
      }
    };
  },
  listenForOpenConversation: () => vi.fn(),
  listenForStartDirectMessage: () => vi.fn(),
}));

afterEach(() => {
  useChatSidebarStore.getState().reset();
  mocks.notificationClickHandler = null;
  vi.clearAllMocks();
});

const openSearch = () => {
  const sidebarState = useChatSidebarStore.getState();
  sidebarState.setSearchQuery("Quang");
  sidebarState.openSearch();
};

describe("AuthenticatedLayout search dismissal", () => {
  it("clears global search for same-route, cross-route, and history navigation", async () => {
    const router = createMemoryRouter(
      [
        {
          element: <AuthenticatedLayout />,
          children: [
            { path: "/chat", element: <div>Chat</div> },
            { path: "/friends", element: <div>Bạn bè</div> },
          ],
        },
      ],
      { initialEntries: ["/chat"] },
    );

    render(<RouterProvider router={router} />);
    expect(await screen.findByText("Chat")).toBeInTheDocument();

    act(openSearch);
    const firstLocationKey = router.state.location.key;
    await act(async () => router.navigate("/chat"));

    expect(router.state.location.key).not.toBe(firstLocationKey);
    await waitFor(() => {
      expect(useChatSidebarStore.getState()).toMatchObject({
        isSearchOpen: false,
        searchQuery: "",
      });
    });

    act(openSearch);
    await act(async () => router.navigate("/friends"));
    expect(await screen.findByText("Bạn bè")).toBeInTheDocument();
    expect(useChatSidebarStore.getState()).toMatchObject({
      isSearchOpen: false,
      searchQuery: "",
    });

    act(openSearch);
    await act(async () => router.navigate(-1));
    expect(await screen.findByText("Chat")).toBeInTheDocument();
    expect(useChatSidebarStore.getState()).toMatchObject({
      isSearchOpen: false,
      searchQuery: "",
    });
  });
});

describe("AuthenticatedLayout notification navigation", () => {
  it("opens the notified conversation from every authenticated route", async () => {
    const router = createMemoryRouter(
      [
        {
          element: <AuthenticatedLayout />,
          children: [
            { path: "/calendar", element: <div>Lịch</div> },
            { path: "/chat/:conversationId", element: <div>Chat</div> },
            { path: "/chat", element: <div>Chat</div> },
          ],
        },
      ],
      { initialEntries: ["/calendar"] },
    );

    render(<RouterProvider router={router} />);
    expect(await screen.findByText("Lịch")).toBeInTheDocument();

    act(() => mocks.notificationClickHandler?.({
      conversationId: "conversation-42",
      messageId: "message-7",
    }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/chat/conversation-42");
    });
  });
});
