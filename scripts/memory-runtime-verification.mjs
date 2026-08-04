import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const port = Number(process.env.MEMORY_VERIFY_PORT ?? 4173);
const baseUrl = process.env.MEMORY_VERIFY_BASE_URL ?? `http://127.0.0.1:${port}`;
const outputPath =
  process.env.MEMORY_VERIFY_OUTPUT ??
  path.join(repoRoot, "memory-runtime-verification-results.json");
const idleMs = Number(process.env.MEMORY_VERIFY_IDLE_MS ?? 300_000);
const composerTimeoutMs = Number(
  process.env.MEMORY_VERIFY_COMPOSER_TIMEOUT_MS ?? 30_000,
);

const logStep = (message) => {
  process.stderr.write(`[memory-runtime] ${message}\n`);
};

const userA = {
  id: "user-a",
  username: "alice",
  email: "alice.memory.local@example.test",
  displayName: "Alice Memory",
  status: "online",
};

const userB = {
  id: "user-b",
  username: "bob",
  email: "bob.memory.local@example.test",
  displayName: "Bob Memory",
  status: "online",
};

const iso = (index) =>
  new Date(Date.UTC(2026, 6, 3, 8, 0, 0) + index * 1_000).toISOString();

const success = (data, meta) => ({
  success: true,
  statusCode: 200,
  message: "ok",
  data,
  ...(meta ? { meta } : {}),
});

const toBase64Url = (input) =>
  Buffer.from(input, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const fakeAccessToken = () => {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return [
    toBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" })),
    toBase64Url(
      JSON.stringify({ sub: userA.id, exp: nowSeconds + 3600, iat: nowSeconds }),
    ),
    "memory-runtime-signature",
  ].join(".");
};

const makeMessage = (conversationId, seq, overrides = {}) => ({
  id: `${conversationId}-msg-${seq}`,
  stableId: `${conversationId}-msg-${seq}`,
  conversationId,
  senderId: seq % 3 === 0 ? userA.id : userB.id,
  senderName: seq % 3 === 0 ? userA.displayName : userB.displayName,
  senderAvatar: "",
  content: `Memory runtime message ${seq} in ${conversationId}`,
  plainText: `Memory runtime message ${seq} in ${conversationId}`,
  type: seq % 37 === 0 ? "image" : seq % 53 === 0 ? "file" : "text",
  status: "sent",
  sendState: "sent",
  transportStatus: "synced_stream",
  messageSeq: seq,
  serverSeq: seq,
  isEdited: false,
  isPinned: false,
  isDeleted: false,
  isSystem: false,
  createdAt: iso(seq),
  updatedAt: iso(seq),
  attachments:
    seq % 37 === 0
      ? [
          {
            id: `${conversationId}-file-${seq}`,
            type: "image",
            fileName: `image-${seq}.png`,
            mimeType: "image/png",
            fileSize: 12_345,
            url: `/test-assets/image-${seq}.png`,
            thumbnailUrl: `/test-assets/thumb-${seq}.png`,
            width: 640,
            height: 360,
          },
        ]
      : seq % 53 === 0
        ? [
            {
              id: `${conversationId}-file-${seq}`,
              type: "file",
              fileName: `file-${seq}.pdf`,
              mimeType: "application/pdf",
              fileSize: 54_321,
              downloadUrl: `/test-assets/file-${seq}.pdf`,
            },
          ]
        : [],
  reactions: [],
  mentions: [],
  ...overrides,
});

const makeConversation = (id, index, messages) => {
  const last = messages.at(-1) ?? makeMessage(id, 1);
  return {
    id,
    conversationId: id,
    type: "group",
    name: index === 0 ? "Large Memory Conversation" : `Memory Room ${index}`,
    displayName: index === 0 ? "Large Memory Conversation" : `Memory Room ${index}`,
    unreadCount: index % 4,
    membershipState: "active",
    memberCount: 2,
    summaryVersion: index + 1,
    createdAt: iso(index),
    updatedAt: last.updatedAt,
    lastActivityAt: last.createdAt,
    lastReadMessageId: null,
    lastReadAt: null,
    firstUnreadMessageId: null,
    firstUnreadMessageAt: null,
    lastMessage: {
      id: last.id,
      conversationId: id,
      senderId: last.senderId,
      senderName: last.senderName,
      content: last.content,
      type: last.type,
      createdAt: last.createdAt,
      messageSeq: last.messageSeq,
    },
    participants: [userA, userB],
  };
};

const buildFixture = () => {
  const messagesByConversation = {};
  const conversations = [];

  for (let i = 0; i < 25; i += 1) {
    const id = i === 0 ? "conv-large" : `conv-${String(i).padStart(2, "0")}`;
    const count = i === 0 ? 1500 : 80;
    const messages = Array.from({ length: count }, (_, offset) =>
      makeMessage(id, offset + 1),
    );
    messagesByConversation[id] = messages;
    conversations.push(makeConversation(id, i, messages));
  }

  return {
    currentUser: userA,
    conversations,
    messagesByConversation,
    sentPayloads: [],
  };
};

const waitForPreview = async (url, timeoutMs = 60_000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
};

const startPreview = async () => {
  if (process.env.MEMORY_VERIFY_BASE_URL) {
    logStep(`using existing preview ${baseUrl}`);
    await waitForPreview(baseUrl);
    return null;
  }

  logStep(`starting vite preview on ${baseUrl}`);
  const child = spawn(
    process.execPath,
    [
      path.join(repoRoot, "node_modules", "vite", "bin", "vite.js"),
      "preview",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, BROWSER: "none" },
    },
  );

  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  await waitForPreview(baseUrl);
  logStep("preview ready");
  return child;
};

const installAuthAndWebSocket = async (page) => {
  await page.addInitScript(({ token, currentUser }) => {
    localStorage.setItem("chat-memory-probe", "1");
    localStorage.setItem(
      "auth-storage",
      JSON.stringify({
        state: {
          user: currentUser,
          authStatus: "authenticated",
          activationContext: null,
          lockedAccount: null,
          pendingVerificationEmail: null,
          pendingVerificationSource: null,
          emailVerificationChallenge: null,
          isAuthenticated: true,
          isInitialized: true,
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
      onopen = null;
      onclose = null;
      onerror = null;
      onmessage = null;
      listeners = new Map();

      constructor(url) {
        this.url = url;
        window.__MEMORY_WS_INSTANCES__ = window.__MEMORY_WS_INSTANCES__ ?? [];
        window.__MEMORY_WS_INSTANCES__.push(this);
        window.__MEMORY_WS_LATEST__ = this;
        window.setTimeout(() => {
          this.readyState = MockWebSocket.OPEN;
          this.emit("open", new Event("open"));
        }, 0);
      }

      send(raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed.event === "auth:authenticate") {
            window.setTimeout(() => {
              this.pushFromTest({ event: "auth:authenticated", data: {} });
            }, 0);
          }
        } catch {
          // ignore malformed harness frames
        }
      }

      close(code = 1000, reason = "normal") {
        this.readyState = MockWebSocket.CLOSED;
        this.emit("close", { code, reason, wasClean: code === 1000 });
      }

      addEventListener(type, listener) {
        if (!this.listeners.has(type)) this.listeners.set(type, new Set());
        this.listeners.get(type).add(listener);
      }

      removeEventListener(type, listener) {
        this.listeners.get(type)?.delete(listener);
      }

      emit(type, event) {
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
        handler?.(event);
        this.listeners.get(type)?.forEach((listener) => listener(event));
      }

      pushFromTest(payload) {
        this.emit(
          "message",
          new MessageEvent("message", {
            data: typeof payload === "string" ? payload : JSON.stringify(payload),
          }),
        );
      }
    }

    Object.defineProperty(window, "WebSocket", {
      configurable: true,
      writable: true,
      value: MockWebSocket,
    });
  }, { token: fakeAccessToken(), currentUser: userA });
};

const installApiMocks = async (page, state) => {
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method();

    const fulfillJson = (payload, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(payload),
      });

    const conversationMatch = pathname.match(/\/api\/v1\/conversations\/([^/]+)$/);
    const messagesMatch = pathname.match(
      /\/api\/v1\/conversations\/([^/]+)\/messages$/,
    );
    const readMatch = pathname.match(
      /\/api\/v1\/conversations\/([^/]+)\/messages\/read$/,
    );

    if (
      ["/api/v1/users/profile", "/api/v1/auth/me", "/api/v1/auth/profile"].includes(
        pathname,
      ) &&
      method === "GET"
    ) {
      await fulfillJson(success(state.currentUser));
      return;
    }

    if (pathname === "/api/v1/auth/logout" && method === "POST") {
      await fulfillJson(success(null));
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
            (sum, item) => sum + item.unreadCount,
            0,
          ),
          conversations: state.conversations.map((conversation) => ({
            conversationId: conversation.id,
            unreadCount: conversation.unreadCount,
            lastReadSeq: 0,
            lastReadMessageId: null,
            lastReadAt: null,
          })),
        }),
      );
      return;
    }

    if (conversationMatch && method === "GET") {
      const conversation = state.conversations.find(
        (item) => item.id === conversationMatch[1],
      );
      await fulfillJson(success(conversation ?? null), conversation ? 200 : 404);
      return;
    }

    if (readMatch && method === "POST") {
      await fulfillJson(success(null));
      return;
    }

    if (messagesMatch && method === "GET") {
      const conversationId = messagesMatch[1];
      const all = state.messagesByConversation[conversationId] ?? [];
      const limit = Math.max(1, Number(url.searchParams.get("limit") ?? 50));
      const beforeSeq = Number(url.searchParams.get("beforeSeq"));
      const beforeId = url.searchParams.get("beforeId");
      let endExclusive = all.length;

      if (Number.isFinite(beforeSeq) && beforeSeq > 0) {
        endExclusive = Math.max(0, beforeSeq - 1);
      } else if (beforeId) {
        const index = all.findIndex((message) => message.id === beforeId);
        if (index >= 0) endExclusive = index;
      }

      const start = Math.max(0, endExclusive - limit);
      const slice = all.slice(start, endExclusive);
      await fulfillJson(
        success(
          {
            messages: slice,
            meta: {
              hasPrev: start > 0,
              hasNext: endExclusive < all.length,
            },
          },
          {
            hasPrev: start > 0,
            hasNext: endExclusive < all.length,
          },
        ),
      );
      return;
    }

    if (messagesMatch && method === "POST") {
      const conversationId = messagesMatch[1];
      const body = request.postDataJSON();
      state.sentPayloads.push(body);
      const existing = state.messagesByConversation[conversationId] ?? [];
      const seq = existing.length + 1;
      const message = makeMessage(conversationId, seq, {
        id: `${conversationId}-server-${seq}`,
        stableId: body.clientMessageId,
        clientMessageId: body.clientMessageId,
        localId: body.localId ?? body.tempId,
        senderId: userA.id,
        senderName: userA.displayName,
        content: String(body.content ?? ""),
        plainText: String(body.plainText ?? body.content ?? ""),
        type: body.type ?? "text",
      });
      state.messagesByConversation[conversationId] = [...existing, message];
      await fulfillJson(success(message));
      return;
    }

    await fulfillJson(success([]));
  });

  await page.route("**/socket.io/**", (route) => route.abort());
  await page.route("**/test-assets/**", (route) =>
    route.fulfill({
      status: 204,
      body: "",
    }),
  );
};

const waitForProbe = async (page) => {
  await page.waitForFunction(() => Boolean(window.__chatMemoryProbe), null, {
    timeout: 30_000,
  });
};

const takeSnapshot = async (page, label) =>
  page.evaluate((snapshotLabel) => window.__chatMemoryProbe.snapshot(snapshotLabel), label);

const scrollTimeline = async (page, direction) => {
  await page.evaluate((scrollDirection) => {
    const scrollEl =
      document.querySelector("[data-testid='simple-timeline-scroll']") ??
      [...document.querySelectorAll("*")]
        .filter((item) => item.scrollHeight > item.clientHeight + 200)
        .sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
    if (scrollEl instanceof HTMLElement) {
      scrollEl.scrollTop =
        scrollDirection === "top" ? 0 : scrollEl.scrollHeight - scrollEl.clientHeight;
      scrollEl.dispatchEvent(new Event("scroll", { bubbles: true }));
    }
  }, direction);
  await page.waitForTimeout(250);
};

const loadOlderUntilCap = async (page, conversationId) => {
  let beforeSeq = 1501;
  for (let i = 0; i < 30; i += 1) {
    beforeSeq -= 50;
    if (beforeSeq <= 1) break;
    await page.evaluate(
      ({ id, seq }) => window.__chatMemoryProbe.loadOlderMessages(id, seq, 50),
      { id: conversationId, seq: beforeSeq },
    );
  }
};

const run = async () => {
  const preview = await startPreview();
  const state = buildFixture();
  const consoleEvents = [];
  const scenarioRows = [];

  const browser = await chromium.launch({
    headless: true,
    args: ["--enable-precise-memory-info", "--js-flags=--expose-gc"],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 960 },
    });
    const page = await context.newPage();

    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") {
        consoleEvents.push({
          type: message.type(),
          text: message.text().slice(0, 500),
        });
      }
    });
    page.on("pageerror", (error) => {
      consoleEvents.push({
        type: "pageerror",
        text: String(error.message ?? error).slice(0, 500),
      });
    });

    await installAuthAndWebSocket(page);
    await installApiMocks(page, state);

    const measure = async (label, action) => {
      const before = await takeSnapshot(page, `${label}:before`);
      await action();
      await page.waitForTimeout(300);
      const after = await takeSnapshot(page, `${label}:after`);
      scenarioRows.push({
        scenario: label,
        before,
        after,
        heapDelta: after.usedJSHeapSize - before.usedJSHeapSize,
        consoleEvents: consoleEvents.length,
      });
      return after;
    };

    logStep("opening authenticated large conversation");
    await page.goto(`${baseUrl}/chat/conv-large?memoryProbe=1`);
    await waitForProbe(page);
    await page.getByTestId("chat-composer-input").waitFor({
      timeout: composerTimeoutMs,
    });
    scenarioRows.push({
      scenario: "login_open_large_initial",
      before: null,
      after: await takeSnapshot(page, "login_open_large_initial"),
      heapDelta: null,
      consoleEvents: consoleEvents.length,
    });

    await measure("idle_5_minutes", async () => {
      logStep(`idle wait ${idleMs}ms`);
      await page.waitForTimeout(idleMs);
    });

    await measure("load_1500_message_pages_and_deep_scroll", async () => {
      logStep("loading older pages and deep scrolling");
      await loadOlderUntilCap(page, "conv-large");
      await scrollTimeline(page, "top");
      await scrollTimeline(page, "bottom");
    });

    await measure("switch_20_conversations", async () => {
      logStep("switching 20 conversations");
      for (let i = 1; i <= 20; i += 1) {
        const id = `conv-${String(i).padStart(2, "0")}`;
        await page.goto(`${baseUrl}/chat/${id}?memoryProbe=1`);
        await page.getByTestId("chat-composer-input").waitFor({
          timeout: composerTimeoutMs,
        });
      }
      await page.goto(`${baseUrl}/chat/conv-large?memoryProbe=1`);
      await page.getByTestId("chat-composer-input").waitFor({
        timeout: composerTimeoutMs,
      });
    });

    await measure("websocket_reconnect_5", async () => {
      logStep("reconnecting websocket 5 times");
      await page.evaluate(() => window.__chatMemoryProbe.reconnectSocket(5));
    });

    await measure("visibility_cycles_10", async () => {
      logStep("dispatching visibility/focus cycles");
      for (let i = 0; i < 10; i += 1) {
        await page.evaluate(() => {
          document.dispatchEvent(new Event("visibilitychange"));
          window.dispatchEvent(new Event("focus"));
        });
        await page.waitForTimeout(50);
      }
    });

    await measure("media_blob_preview_cache_40", async () => {
      logStep("seeding blob preview cache");
      await page.evaluate(() => window.__chatMemoryProbe.seedBlobPreviewCache(40));
    });

    await measure("optimistic_send_and_reconcile", async () => {
      logStep("sending optimistic text message");
      await page.getByTestId("chat-composer-input").click();
      await page.keyboard.type("memory runtime optimistic probe");
      await page.getByTestId("chat-send-button").click();
      await page.waitForTimeout(1_000);
    });

    await measure("logout_login_again", async () => {
      logStep("logout and login again via seeded auth");
      await page.evaluate(() => window.__chatMemoryProbe.logoutSoft());
      await page.goto(`${baseUrl}/chat/conv-large?memoryProbe=1`);
      await page.getByTestId("chat-composer-input").waitFor({
        timeout: composerTimeoutMs,
      });
    });

    const result = {
      environment: {
        baseUrl,
        chromiumFlags: ["--enable-precise-memory-info", "--js-flags=--expose-gc"],
        idleMs,
        generatedAt: new Date().toISOString(),
        fixture: {
          users: 2,
          conversations: state.conversations.length,
          largeConversationMessages: state.messagesByConversation["conv-large"].length,
          sentPayloads: state.sentPayloads.length,
        },
      },
      scenarios: scenarioRows,
      consoleEvents,
    };

    await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf-8");
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
    if (preview) {
      preview.kill();
    }
  }
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
