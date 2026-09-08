import "@testing-library/jest-dom/vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import {
  createMemoryRouter,
  RouterProvider,
} from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useChatSidebarStore } from "../features/chat/state/chatSidebarStore";
import { AuthenticatedLayout } from "./AuthenticatedLayout";

const mocks = vi.hoisted(() => ({
  checkReminder: vi.fn(),
  fetchFriends: vi.fn(),
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
  createChatRouteState: vi.fn(),
  listenForOpenConversation: () => vi.fn(),
  listenForStartDirectMessage: () => vi.fn(),
}));

const openSearch = () => {
  const sidebarState = useChatSidebarStore.getState();
  sidebarState.setSearchQuery("Quang");
  sidebarState.openSearch();
};

// React Router creates a Request during client-side navigation. In jsdom its
// AbortController comes from jsdom while Node's native Request validates
// against Node's AbortSignal class. Keep this test focused on navigation state
// by retrying without the incompatible signal in that environment only.
const nativeRequest = globalThis.Request;

beforeEach(() => {
  class CompatibleRequest extends nativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      if (init?.signal) {
        try {
          super(input, init);
          return;
        } catch (error) {
          if (!(error instanceof TypeError)) throw error;
          const { signal: _signal, ...safeInit } = init;
          super(input, safeInit);
          return;
        }
      }
      super(input, init);
    }
  }

  globalThis.Request = CompatibleRequest as typeof Request;
});

afterEach(() => {
  globalThis.Request = nativeRequest;
  useChatSidebarStore.getState().reset();
  vi.clearAllMocks();
});

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
