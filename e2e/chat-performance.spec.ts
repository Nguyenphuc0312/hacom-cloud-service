import { expect, test, type Page } from "@playwright/test";

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
  serverSeq: number;
};

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

const success = <T,>(data: T, meta?: Record<string, unknown>) => ({
  success: true,
  statusCode: 200,
  message: "ok",
  data,
  ...(meta ? { meta } : {}),
});

const iso = (index: number) =>
  new Date(Date.UTC(2026, 0, 1, 9, 0, 0) + index * 15_000).toISOString();

const makeMessage = (index: number, conversationId = "room-perf"): MockMessage => ({
  id: `msg-${index}`,
  conversationId,
  senderId: index % 4 === 0 ? "user-b" : "user-a",
  senderName: index % 4 === 0 ? "Bob" : "Alice",
  content: `Performance message ${index}`,
  type: "text",
  status: "sent",
  createdAt: iso(index),
  updatedAt: iso(index),
  serverSeq: index + 1,
});

const makeMessages = (count: number, conversationId = "room-perf") =>
  Array.from({ length: count }, (_, index) => makeMessage(index, conversationId));

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

    const performanceWindow = window as Window & {
      __mockSockets?: MockWebSocket[];
      __emitChatSocketEvent?: (event: string, data: unknown) => void;
    };

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
        performanceWindow.__mockSockets = [
          ...(performanceWindow.__mockSockets ?? []),
          this,
        ];
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
              this.receive("auth:authenticated", {});
            }, 0);
          }
        } catch {
          // Ignore malformed frames in the test harness.
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

      receive(event: string, data: unknown) {
        this.emit(
          "message",
          new MessageEvent("message", {
            data: JSON.stringify({ event, data }),
          }),
        );
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

    performanceWindow.__emitChatSocketEvent = (event, data) => {
      performanceWindow.__mockSockets?.forEach((socket) => {
        if (socket.readyState === MockWebSocket.OPEN) {
          socket.receive(event, data);
        }
      });
    };

    Object.defineProperty(window, "WebSocket", {
      configurable: true,
      writable: true,
      value: MockWebSocket,
    });
  }, { token: accessToken });
};

const installApiMocks = async (page: Page, messages: MockMessage[]) => {
  const conversation = {
    id: "room-perf",
    conversationId: "room-perf",
    type: "group",
    name: "Performance Room",
    unreadCount: 0,
    membershipState: "active",
    memberCount: 2,
    summaryVersion: 1,
    updatedAt: messages.at(-1)?.updatedAt,
    createdAt: messages[0]?.createdAt,
    lastActivityAt: messages.at(-1)?.updatedAt,
    lastReadMessageId: messages.at(-1)?.id,
    lastReadAt: messages.at(-1)?.createdAt,
    firstUnreadMessageId: null,
    firstUnreadMessageAt: null,
    lastMessage: messages.at(-1) ?? null,
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
        displayName: "Bob",
        status: "online",
      },
    ],
  };

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

    if (pathname === "/api/v1/users/profile" && method === "GET") {
      await fulfillJson(
        success({
          id: "user-a",
          username: "alice",
          displayName: "Alice",
          status: "online",
        }),
      );
      return;
    }

    if (pathname === "/api/v1/conversations" && method === "GET") {
      await fulfillJson(success([conversation]));
      return;
    }

    if (pathname === "/api/v1/conversations/unread-summary" && method === "GET") {
      await fulfillJson(success({ totalUnreadCount: 0, conversations: [] }));
      return;
    }

    if (pathname === "/api/v1/conversations/room-perf" && method === "GET") {
      await fulfillJson(success(conversation));
      return;
    }

    if (
      pathname === "/api/v1/conversations/room-perf/messages" &&
      method === "GET"
    ) {
      await fulfillJson(
        success(messages, {
          hasNext: false,
          hasPrev: false,
          readState: {
            unreadCount: 0,
            lastReadMessageId: messages.at(-1)?.id ?? null,
            lastReadAt: messages.at(-1)?.createdAt ?? null,
            firstUnreadMessageId: null,
            firstUnreadMessageAt: null,
          },
        }),
      );
      return;
    }

    await fulfillJson(success(null));
  });
};

const waitForPerformanceEvent = async (page: Page, eventName: string) => {
  await page.waitForFunction(
    (name) => {
      const performanceWindow = window as Window & {
        __chatPerformanceEvents?: Array<{ name: string }>;
      };
      return performanceWindow.__chatPerformanceEvents?.some(
        (event) => event.name === name,
      );
    },
    eventName,
    { timeout: 5_000 },
  );
};

const readPerformanceDuration = async (page: Page, eventName: string) =>
  page.evaluate((name) => {
    const performanceWindow = window as Window & {
      __chatPerformanceEvents?: Array<{
        name: string;
        durationMs?: number;
        details?: Record<string, unknown>;
      }>;
    };
    const event = [...(performanceWindow.__chatPerformanceEvents ?? [])]
      .reverse()
      .find((item) => item.name === name);
    if (!event) return null;
    if (typeof event.durationMs === "number") return event.durationMs;
    const latencyMs = event.details?.latencyMs;
    return typeof latencyMs === "number" ? latencyMs : null;
  }, eventName);

test("10k message conversation stays virtualized and responsive", async ({ page }) => {
  const messages = makeMessages(10_000);
  await seedAuth(page);
  await installApiMocks(page, messages);

  const openStart = Date.now();
  await page.goto("/chat/room-perf?debugPerformance=1");
  await page.getByTestId("message-list-scroll").waitFor({ timeout: 10_000 });
  const openToFirstRenderWallMs = Date.now() - openStart;

  await expect(page.getByTestId("message-item-msg-9999")).toBeVisible({
    timeout: 10_000,
  });
  const openToBottomSettledWallMs = Date.now() - openStart;
  await waitForPerformanceEvent(page, "conversation-open-first-render");
  await waitForPerformanceEvent(page, "open_to_bottom_applied");
  const openToFirstRenderMs =
    (await readPerformanceDuration(page, "conversation-open-first-render")) ??
    openToFirstRenderWallMs;
  const openToBottomSettledMs =
    (await readPerformanceDuration(page, "open_to_bottom_applied")) ??
    openToBottomSettledWallMs;

  const initialMetrics = await page.evaluate(() => {
    const scroll = document.querySelector<HTMLElement>(
      '[data-testid="message-list-scroll"]',
    );
    return {
      renderedMessageItems: document.querySelectorAll(
        '[data-testid^="message-item-"]',
      ).length,
      domNodes: document.querySelectorAll("*").length,
      scrollTop: scroll?.scrollTop ?? 0,
      scrollHeight: scroll?.scrollHeight ?? 0,
      clientHeight: scroll?.clientHeight ?? 0,
    };
  });

  const keypressLatencyMs = await page.evaluate(async () => {
    const textarea = document.querySelector<HTMLTextAreaElement>(
      '[data-testid="chat-composer-input"]',
    );
    if (!textarea) return Number.POSITIVE_INFINITY;
    const startedAt = performance.now();
    textarea.focus();
    textarea.value = "perf keypress";
    textarea.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return performance.now() - startedAt;
  });

  const realtimeMessage = makeMessage(10_000);
  const appendStart = Date.now();
  await page.evaluate((message) => {
    const performanceWindow = window as Window & {
      __emitChatSocketEvent?: (event: string, data: unknown) => void;
    };
    performanceWindow.__emitChatSocketEvent?.("message:new", message);
  }, realtimeMessage);
  await expect(page.getByTestId("message-item-msg-10000")).toBeVisible({
    timeout: 5_000,
  });
  await waitForPerformanceEvent(page, "append_to_bottom_latency");
  const appendRealtimeMessageLatencyMs =
    (await readPerformanceDuration(page, "append_to_bottom_latency")) ??
    Date.now() - appendStart;

  const finalMetrics = await page.evaluate(() => {
    const scroll = document.querySelector<HTMLElement>(
      '[data-testid="message-list-scroll"]',
    );
    return {
      renderedMessageItems: document.querySelectorAll(
        '[data-testid^="message-item-"]',
      ).length,
      domNodes: document.querySelectorAll("*").length,
      distanceToBottom: scroll
        ? Math.max(0, scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight)
        : Number.POSITIVE_INFINITY,
    };
  });

  const report = {
    openToFirstRenderMs,
    openToFirstRenderWallMs,
    openToBottomSettledMs,
    openToBottomSettledWallMs,
    appendRealtimeMessageLatencyMs,
    keypressLatencyMs: Math.round(keypressLatencyMs * 100) / 100,
    initialRenderedMessageItems: initialMetrics.renderedMessageItems,
    finalRenderedMessageItems: finalMetrics.renderedMessageItems,
    initialDomNodes: initialMetrics.domNodes,
    finalDomNodes: finalMetrics.domNodes,
    finalDistanceToBottom: finalMetrics.distanceToBottom,
  };

  console.table([report]);

  expect(openToFirstRenderMs).toBeLessThanOrEqual(1_000);
  expect(openToBottomSettledMs).toBeLessThanOrEqual(1_500);
  expect(appendRealtimeMessageLatencyMs).toBeLessThanOrEqual(100);
  expect(keypressLatencyMs).toBeLessThanOrEqual(32);
  expect(initialMetrics.renderedMessageItems).toBeLessThanOrEqual(120);
  expect(finalMetrics.renderedMessageItems).toBeLessThanOrEqual(120);
  expect(finalMetrics.distanceToBottom).toBeLessThanOrEqual(120);
});
