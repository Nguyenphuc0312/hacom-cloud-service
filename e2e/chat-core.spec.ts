import { expect, test, type Page, type Route } from "@playwright/test";

type MockConversation = {
  id: string;
  conversationId: string;
  type: "group" | "direct";
  name: string;
  displayName?: string;
  unreadCount: number;
  membershipState: "active";
  memberCount: number;
  participantCount?: number;
  participants?: Array<{
    id: string;
    username: string;
    displayName: string;
    status: string;
    avatar?: string | null;
  }>;
  summaryVersion: number;
  updatedAt: string;
  createdAt: string;
  lastActivityAt: string;
  lastReadMessageId?: string | null;
  lastReadAt?: string | null;
  firstUnreadMessageId?: string | null;
  firstUnreadMessageAt?: string | null;
  lastMessage: Record<string, unknown> | null;
};

type MockMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  content: string;
  type: "text";
  status: "sent";
  createdAt: string;
  updatedAt: string;
  replyTo?: string;
  replyToMessage?: Record<string, unknown>;
};

type MockSearchUser = {
  id: string;
  username: string;
  displayName: string;
  status: string;
  avatarUrl?: string | null;
  email?: string | null;
  employeeCode?: string | null;
  isFriend?: boolean;
  canAddFriend?: boolean;
  friendshipStatus?: "none" | "pending" | "accepted" | "declined" | "canceled";
};

type MockState = {
  currentUser: {
    id: string;
    username: string;
    displayName: string;
    status: string;
    avatar?: string | null;
  };
  conversations: MockConversation[];
  messagesByConversation: Record<string, MockMessage[]>;
  searchUsers?: MockSearchUser[];
  sentPayloads: Array<Record<string, unknown>>;
  unreadFeedHits: number;
};

const success = <T>(data: T, meta?: Record<string, unknown>) => ({
  success: true,
  statusCode: 200,
  message: "ok",
  data,
  ...(meta ? { meta } : {}),
});

const iso = (value: string) => new Date(value).toISOString();

const toBase64Url = (value: string) =>
  Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const createFakeAccessToken = (userId = "user-a") => {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return [
    toBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" })),
    toBase64Url(
      JSON.stringify({
        sub: userId,
        exp: nowSeconds + 60 * 60,
        iat: nowSeconds,
      }),
    ),
    "playwright-signature",
  ].join(".");
};

const makeMessage = (overrides: Partial<MockMessage>): MockMessage => ({
  id: "msg-1",
  conversationId: "room-1",
  senderId: "user-a",
  senderName: "Alice",
  content: "hello",
  type: "text",
  status: "sent",
  createdAt: iso("2026-04-16T09:00:00.000Z"),
  updatedAt: iso("2026-04-16T09:00:00.000Z"),
  ...overrides,
});

const toMessageSummary = (message: MockMessage) => ({
  id: message.id,
  conversationId: message.conversationId,
  senderId: message.senderId,
  senderName: message.senderName,
  content: message.content,
  type: message.type,
  createdAt: message.createdAt,
  isDeleted: false,
  ...(message.replyTo ? { replyTo: message.replyTo } : {}),
  ...(message.replyToMessage ? { replyToMessage: message.replyToMessage } : {}),
});

const makeConversation = (
  id: string,
  name: string,
  overrides: Partial<MockConversation> = {},
): MockConversation => ({
  id,
  conversationId: id,
  type: "group",
  name,
  unreadCount: 0,
  membershipState: "active",
  memberCount: 2,
  summaryVersion: 1,
  updatedAt: iso("2026-04-16T09:00:00.000Z"),
  createdAt: iso("2026-04-16T09:00:00.000Z"),
  lastActivityAt: iso("2026-04-16T09:00:00.000Z"),
  lastReadMessageId: null,
  lastReadAt: null,
  firstUnreadMessageId: null,
  firstUnreadMessageAt: null,
  lastMessage: null,
  ...overrides,
});

const seedAuth = async (page: Page) => {
  const accessToken = createFakeAccessToken();

  await page.addInitScript(({ token }) => {
    localStorage.setItem(
      "auth-storage",
      JSON.stringify({
        state: {
          user: {
            id: "user-a",
            username: "alice",
            displayName: "Alice",
            status: "online",
          },
          authStatus: "authenticated",
          activationContext: null,
          lockedAccount: null,
          pendingVerificationEmail: null,
          pendingVerificationSource: null,
          emailVerificationChallenge: null,
          isAuthenticated: true,
        },
        version: 0,
      }),
    );
    localStorage.setItem("authSessionActive", "true");
    sessionStorage.setItem("accessToken", token);

    class MockWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;

      readyState = MockWebSocket.CONNECTING;
      url: string;
      onopen: ((event: Event) => void) | null = null;
      onclose:
        | ((event: { code: number; reason: string; wasClean: boolean }) => void)
        | null = null;
      onerror: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent<string>) => void) | null = null;
      private listeners = new Map<string, Set<(event: unknown) => void>>();

      constructor(url: string) {
        this.url = url;
        window.setTimeout(() => {
          this.readyState = MockWebSocket.OPEN;
          this.emit("open", new Event("open"));
        }, 0);
      }

      send(payload: string) {
        try {
          const parsed = JSON.parse(payload) as { event?: string };
          if (parsed.event === "auth:authenticate") {
            window.setTimeout(() => {
              this.emit(
                "message",
                new MessageEvent("message", {
                  data: JSON.stringify({
                    event: "auth:authenticated",
                    data: {},
                  }),
                }),
              );
            }, 0);
          }
        } catch {
          // Ignore malformed frames in test harness.
        }
      }

      close(code = 1000, reason = "normal") {
        this.readyState = MockWebSocket.CLOSED;
        this.emit("close", { code, reason, wasClean: true });
      }

      addEventListener(type: string, listener: (event: unknown) => void) {
        if (!this.listeners.has(type)) {
          this.listeners.set(type, new Set());
        }
        this.listeners.get(type)?.add(listener);
      }

      removeEventListener(type: string, listener: (event: unknown) => void) {
        this.listeners.get(type)?.delete(listener);
      }

      private emit(type: string, event: unknown) {
        const handler =
          type === "open"
            ? this.onopen
            : type === "close"
              ? this.onclose
              : type === "error"
                ? this.onerror
                : type === "message"
                  ? this.onmessage
                  : null;
        handler?.(event as never);
        this.listeners.get(type)?.forEach((listener) => listener(event));
      }
    }

    Object.defineProperty(window, "WebSocket", {
      configurable: true,
      writable: true,
      value: MockWebSocket,
    });
  }, { token: accessToken });
};

const installApiMocks = async (page: Page, state: MockState) => {
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method();

    const fulfillJson = async (payload: unknown) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(payload),
      });

    const conversationMatch = pathname.match(/\/api\/v1\/conversations\/([^/]+)$/);
    const messagesMatch = pathname.match(/\/api\/v1\/conversations\/([^/]+)\/messages$/);
    const unreadFeedMatch = pathname.match(
      /\/api\/v1\/conversations\/([^/]+)\/messages\/unread-feed$/,
    );
    const readMatch = pathname.match(/\/api\/v1\/conversations\/([^/]+)\/messages\/read$/);

    if (pathname === "/api/v1/users/profile" && method === "GET") {
      await fulfillJson(success(state.currentUser));
      return;
    }

    if (pathname === "/api/v1/users/search" && method === "GET") {
      const keyword = (url.searchParams.get("q") ?? "").trim().toLowerCase();
      const results = (state.searchUsers ?? []).filter((user) => {
        const haystacks = [
          user.displayName,
          user.username,
          user.email ?? "",
          user.employeeCode ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return haystacks.includes(keyword);
      });

      await fulfillJson(success(results));
      return;
    }

    const userMatch = pathname.match(/\/api\/v1\/users\/([^/]+)$/);
    if (userMatch && method === "GET") {
      const [, userId] = userMatch;
      const user =
        state.searchUsers?.find((item) => item.id === userId) ??
        (state.currentUser.id === userId ? state.currentUser : null);
      await fulfillJson(success(user));
      return;
    }

    if (pathname === "/api/v1/conversations" && method === "GET") {
      await fulfillJson(success(state.conversations));
      return;
    }

    if (pathname === "/api/v1/conversations/unread-summary" && method === "GET") {
      await fulfillJson(
        success({
          totalUnreadCount: state.conversations.reduce(
            (total, conversation) => total + Math.max(0, conversation.unreadCount),
            0,
          ),
          conversations: state.conversations
            .filter((conversation) => conversation.unreadCount > 0)
            .map((conversation) => ({
              conversationId: conversation.id,
              unreadCount: conversation.unreadCount,
              lastReadMessageId: conversation.lastReadMessageId ?? null,
              lastReadAt: conversation.lastReadAt ?? null,
            })),
        }),
      );
      return;
    }

    if (conversationMatch && method === "GET") {
      const [, conversationId] = conversationMatch;
      const conversation = state.conversations.find((item) => item.id === conversationId);
      await fulfillJson(success(conversation ?? null));
      return;
    }

    if (unreadFeedMatch && method === "GET") {
      const [, conversationId] = unreadFeedMatch;
      const conversation = state.conversations.find((item) => item.id === conversationId);
      const messages = state.messagesByConversation[conversationId] ?? [];
      const firstUnreadMessageId =
        conversation?.firstUnreadMessageId ??
        messages.find((message) => message.id !== conversation?.lastReadMessageId)?.id ??
        null;
      const unreadMessages =
        firstUnreadMessageId && messages.some((message) => message.id === firstUnreadMessageId)
          ? messages.slice(messages.findIndex((message) => message.id === firstUnreadMessageId))
          : [];
      state.unreadFeedHits += 1;
      await fulfillJson(
        success({
          messages: unreadMessages,
          readState: {
            unreadCount: conversation?.unreadCount ?? unreadMessages.length,
            lastReadMessageId: conversation?.lastReadMessageId ?? null,
            lastReadAt: conversation?.lastReadAt ?? null,
            firstUnreadMessageId,
            firstUnreadMessageAt:
              unreadMessages[0]?.createdAt ?? conversation?.firstUnreadMessageAt ?? null,
          },
          limit: Number(url.searchParams.get("limit") ?? unreadMessages.length ?? 0),
          hasMore: false,
        }),
      );
      return;
    }

    if (messagesMatch && method === "GET") {
      const [, conversationId] = messagesMatch;
      const conversation = state.conversations.find((item) => item.id === conversationId);
      const messages = state.messagesByConversation[conversationId] ?? [];
      await fulfillJson(
        success(messages, {
          hasNext: false,
          hasPrev: false,
          readState: {
            unreadCount: conversation?.unreadCount ?? 0,
            lastReadMessageId: conversation?.lastReadMessageId ?? null,
            lastReadAt: conversation?.lastReadAt ?? null,
            firstUnreadMessageId: conversation?.firstUnreadMessageId ?? null,
            firstUnreadMessageAt: conversation?.firstUnreadMessageAt ?? null,
          },
        }),
      );
      return;
    }

    if (messagesMatch && method === "POST") {
      const [, conversationId] = messagesMatch;
      const body = request.postDataJSON() as Record<string, unknown>;
      state.sentPayloads.push(body);
      const existing = state.messagesByConversation[conversationId] ?? [];
      const replyTarget =
        typeof body.replyTo === "string"
          ? existing.find((message) => message.id === body.replyTo)
          : undefined;
      const nextMessage = makeMessage({
        id: `msg-${existing.length + 1}`,
        conversationId,
        senderId: state.currentUser.id,
        senderName: state.currentUser.displayName,
        content: String(body.content ?? ""),
        createdAt: iso(`2026-04-16T09:${10 + existing.length}:00.000Z`),
        updatedAt: iso(`2026-04-16T09:${10 + existing.length}:00.000Z`),
        ...(typeof body.replyTo === "string" ? { replyTo: body.replyTo } : {}),
        ...(replyTarget ? { replyToMessage: toMessageSummary(replyTarget) } : {}),
      });
      state.messagesByConversation[conversationId] = [...existing, nextMessage];
      state.conversations = state.conversations.map((conversation) =>
        conversation.id === conversationId
          ? {
              ...conversation,
              lastMessage: toMessageSummary(nextMessage),
              updatedAt: nextMessage.updatedAt,
              lastActivityAt: nextMessage.updatedAt,
              summaryVersion: conversation.summaryVersion + 1,
            }
          : conversation,
      );
      await fulfillJson(success(nextMessage));
      return;
    }

    if (readMatch && method === "POST") {
      const [, conversationId] = readMatch;
      const body = request.postDataJSON() as Record<string, unknown>;
      state.conversations = state.conversations.map((conversation) =>
        conversation.id === conversationId
          ? {
              ...conversation,
              unreadCount: 0,
              lastReadMessageId:
                typeof body.lastVisibleMessageId === "string"
                  ? body.lastVisibleMessageId
                  : conversation.lastReadMessageId ?? null,
              firstUnreadMessageId: null,
              firstUnreadMessageAt: null,
            }
          : conversation,
      );
      await fulfillJson(success(null));
      return;
    }

    await fulfillJson(success([]));
  });

  await page.route("**/socket.io/**", async (route: Route) => {
    await route.abort();
  });
};

const bootChatPage = async (page: Page, state: MockState, route = "/chat/room-1") => {
  await seedAuth(page);
  await installApiMocks(page, state);
  await page.goto(route);
  await expect(page.getByTestId("chat-composer-input")).toBeVisible();
};

test("send message persists after leaving and re-entering the conversation", async ({ page }) => {
  const state: MockState = {
    currentUser: {
      id: "user-a",
      username: "alice",
      displayName: "Alice",
      status: "online",
    },
    conversations: [
      makeConversation("room-1", "Room 1", {
        lastMessage: toMessageSummary(
          makeMessage({ id: "seed-1", conversationId: "room-1", content: "Seed room 1" }),
        ),
      }),
      makeConversation("room-2", "Room 2"),
    ],
    messagesByConversation: {
      "room-1": [makeMessage({ id: "seed-1", conversationId: "room-1", content: "Seed room 1" })],
      "room-2": [makeMessage({ id: "seed-2", conversationId: "room-2", content: "Seed room 2" })],
    },
    sentPayloads: [],
    unreadFeedHits: 0,
  };

  await bootChatPage(page, state);

  await page.getByTestId("chat-composer-input").fill("Message survives re-entry");
  await page.getByTestId("chat-send-button").click();
  await expect(page.getByTestId("message-item-msg-2")).toContainText(
    "Message survives re-entry",
  );

  await page.goto("/chat/room-2");
  await expect(page.getByTestId("message-item-seed-2")).toContainText("Seed room 2");

  await page.goto("/chat/room-1");
  await expect(page.getByTestId("message-item-msg-2")).toContainText(
    "Message survives re-entry",
  );
});

test("reply sends canonical replyTo and still renders reply preview after reload", async ({ page }) => {
  const parentMessage = makeMessage({
    id: "msg-parent",
    conversationId: "room-1",
    content: "Parent seed",
    senderId: "user-b",
    senderName: "Bob",
  });
  const state: MockState = {
    currentUser: {
      id: "user-a",
      username: "alice",
      displayName: "Alice",
      status: "online",
    },
    conversations: [
      makeConversation("room-1", "Room 1", {
        lastMessage: toMessageSummary(parentMessage),
      }),
    ],
    messagesByConversation: {
      "room-1": [parentMessage],
    },
    sentPayloads: [],
    unreadFeedHits: 0,
  };

  await bootChatPage(page, state);

  await page.getByTestId("message-item-msg-parent").hover();
  await page.getByTestId("message-action-reply").first().click();
  await page.getByTestId("chat-composer-input").fill("Reply body");
  await page.getByTestId("chat-send-button").click();

  await expect(page.getByTestId("message-item-msg-2")).toContainText("Reply body");
  expect(state.sentPayloads.at(-1)?.replyTo).toBe("msg-parent");

  await page.reload();

  await expect(page.getByTestId("message-item-msg-2")).toContainText("Reply body");
  await expect(page.getByTestId("message-item-msg-2")).toContainText("Parent seed");
});

test("conversation with unread bootstraps from server unread feed and lands on first unread anchor", async ({ page }) => {
  const readMessage = makeMessage({
    id: "msg-read",
    conversationId: "room-1",
    content: "Read before anchor",
    senderId: "user-b",
    senderName: "Bob",
    createdAt: iso("2026-04-16T09:00:00.000Z"),
    updatedAt: iso("2026-04-16T09:00:00.000Z"),
  });
  const unreadMessage = makeMessage({
    id: "msg-unread-1",
    conversationId: "room-1",
    content: "First unread from server",
    senderId: "user-b",
    senderName: "Bob",
    createdAt: iso("2026-04-16T09:05:00.000Z"),
    updatedAt: iso("2026-04-16T09:05:00.000Z"),
  });
  const latestUnread = makeMessage({
    id: "msg-unread-2",
    conversationId: "room-1",
    content: "Latest unread from server",
    senderId: "user-b",
    senderName: "Bob",
    createdAt: iso("2026-04-16T09:06:00.000Z"),
    updatedAt: iso("2026-04-16T09:06:00.000Z"),
  });

  const state: MockState = {
    currentUser: {
      id: "user-a",
      username: "alice",
      displayName: "Alice",
      status: "online",
    },
    conversations: [
      makeConversation("room-1", "Unread Room", {
        unreadCount: 2,
        lastReadMessageId: "msg-read",
        lastReadAt: readMessage.createdAt,
        lastMessage: toMessageSummary(latestUnread),
      }),
    ],
    messagesByConversation: {
      "room-1": [readMessage, unreadMessage, latestUnread],
    },
    sentPayloads: [],
    unreadFeedHits: 0,
  };

  await bootChatPage(page, state);

  await expect(page.getByText("First unread from server")).toBeVisible();
  expect(state.unreadFeedHits).toBeGreaterThan(0);
});

test("profile panel follows the active direct conversation instead of keeping stale user context", async ({ page }) => {
  const state: MockState = {
    currentUser: {
      id: "user-a",
      username: "alice",
      displayName: "Alice",
      status: "online",
    },
    conversations: [
      makeConversation("direct-1", "Bob Thread", {
        type: "direct",
        displayName: "Bob Builder",
        participantCount: 2,
        participants: [
          {
            id: "user-a",
            username: "alice",
            displayName: "Alice",
            status: "online",
          },
          {
            id: "user-b",
            username: "bob",
            displayName: "Bob Builder",
            status: "online",
          },
        ],
        lastMessage: toMessageSummary(
          makeMessage({
            id: "seed-bob",
            conversationId: "direct-1",
            senderId: "user-b",
            senderName: "Bob Builder",
            content: "Hi from Bob",
          }),
        ),
      }),
      makeConversation("direct-2", "Carol Thread", {
        type: "direct",
        displayName: "Carol Outside",
        participantCount: 2,
        participants: [
          {
            id: "user-a",
            username: "alice",
            displayName: "Alice",
            status: "online",
          },
          {
            id: "user-c",
            username: "carol",
            displayName: "Carol Outside",
            status: "offline",
          },
        ],
        lastMessage: toMessageSummary(
          makeMessage({
            id: "seed-carol",
            conversationId: "direct-2",
            senderId: "user-c",
            senderName: "Carol Outside",
            content: "Hi from Carol",
          }),
        ),
      }),
    ],
    messagesByConversation: {
      "direct-1": [
        makeMessage({
          id: "seed-bob",
          conversationId: "direct-1",
          senderId: "user-b",
          senderName: "Bob Builder",
          content: "Hi from Bob",
        }),
      ],
      "direct-2": [
        makeMessage({
          id: "seed-carol",
          conversationId: "direct-2",
          senderId: "user-c",
          senderName: "Carol Outside",
          content: "Hi from Carol",
        }),
      ],
    },
    searchUsers: [
      {
        id: "user-b",
        username: "bob",
        displayName: "Bob Builder",
        status: "online",
        email: "bob@example.com",
        employeeCode: "EMP002",
        isFriend: true,
        canAddFriend: false,
        friendshipStatus: "accepted",
      },
      {
        id: "user-c",
        username: "carol",
        displayName: "Carol Outside",
        status: "offline",
        email: "carol@example.com",
        employeeCode: "EMP003",
        isFriend: true,
        canAddFriend: false,
        friendshipStatus: "accepted",
      },
    ],
    sentPayloads: [],
    unreadFeedHits: 0,
  };

  await bootChatPage(page, state, "/chat/direct-1");

  await page.getByRole("button", { name: "View conversation info" }).click();
  await expect(page.getByRole("heading", { name: "Bob Builder" })).toBeVisible();

  await page.goto("/chat/direct-2");
  await expect(page.getByTestId("chat-composer-input")).toBeVisible();

  await expect(page.getByRole("heading", { name: "Carol Outside" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bob Builder" })).toHaveCount(0);
});

test("new conversation search supports multiple identifiers and group mode enforces friends-only selection", async ({ page }) => {
  const state: MockState = {
    currentUser: {
      id: "user-a",
      username: "alice",
      displayName: "Alice",
      status: "online",
    },
    conversations: [makeConversation("room-1", "Room 1")],
    messagesByConversation: {
      "room-1": [makeMessage({ id: "seed-1", conversationId: "room-1", content: "Seed room 1" })],
    },
    searchUsers: [
      {
        id: "user-b",
        username: "bob",
        displayName: "Bob Builder",
        status: "online",
        employeeCode: "EMP002",
        email: "bob@example.com",
        isFriend: true,
        canAddFriend: false,
        friendshipStatus: "accepted",
      },
      {
        id: "user-c",
        username: "carol",
        displayName: "Carol Outside",
        status: "offline",
        employeeCode: "EMP003",
        email: "carol@example.com",
        isFriend: false,
        canAddFriend: true,
        friendshipStatus: "none",
      },
    ],
    sentPayloads: [],
    unreadFeedHits: 0,
  };

  await bootChatPage(page, state);

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("chat:open-new-chat-modal"));
  });

  const searchInput = page.getByPlaceholder("Search by name or username...");
  await expect(page.getByText("New conversation")).toBeVisible();

  await searchInput.fill("Builder");
  await expect(page.getByText("Bob Builder")).toBeVisible();

  await searchInput.fill("carol");
  await expect(page.getByText("Carol Outside")).toBeVisible();

  await searchInput.fill("carol@example.com");
  await expect(page.getByText("Carol Outside")).toBeVisible();

  await searchInput.fill("EMP002");
  await expect(page.getByText("Bob Builder")).toBeVisible();

  await page.getByRole("button", { name: "Create group" }).click();

  await searchInput.fill("carol");
  await expect(
    page.getByText(/Friends only|\[newChatModal\.friendsOnly\]/),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Carol Outside/ })).toBeDisabled();

  await searchInput.fill("bob");
  await page.getByRole("button", { name: /Bob Builder/ }).click();
  await page.getByPlaceholder("Enter group name...").fill("Ops Squad");
  await expect(
    page.getByRole("button", { name: "Create group (1 users)" }),
  ).toBeVisible();
});
