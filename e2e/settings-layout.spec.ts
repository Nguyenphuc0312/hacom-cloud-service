import { expect, test, type Page } from "@playwright/test";

const success = <T>(data: T) => ({
  success: true,
  statusCode: 200,
  message: "ok",
  data,
});

const toBase64Url = (value: string) =>
  Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const createFakeAccessToken = (userId = "user-1") => {
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

const seedAuth = async (page: Page) => {
  const accessToken = createFakeAccessToken();

  await page.addInitScript(({ token }) => {
    localStorage.setItem(
      "auth-storage",
      JSON.stringify({
        state: {
          user: {
            id: "user-1",
            username: "alice",
            displayName: "Alice Nguyen",
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
      onopen: ((event: Event) => void) | null = null;
      onclose:
        | ((event: { code: number; reason: string; wasClean: boolean }) => void)
        | null = null;
      onerror: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent<string>) => void) | null = null;

      constructor() {
        window.setTimeout(() => {
          this.readyState = MockWebSocket.OPEN;
          this.onopen?.(new Event("open"));
        }, 0);
      }

      send() {}

      close() {
        this.readyState = MockWebSocket.CLOSED;
        this.onclose?.({ code: 1000, reason: "ok", wasClean: true });
      }

      addEventListener() {}

      removeEventListener() {}
    }

    // @ts-expect-error test shim
    window.WebSocket = MockWebSocket;
  }, { token: accessToken });
};

test("settings owns the only scroll root", async ({ page }) => {
  await seedAuth(page);

  await page.route("**/users/profile", async (route) => {
    await route.fulfill({
      json: success({
        id: "user-1",
        username: "alice",
        displayName: "Alice Nguyen",
        phone: "+84912345678",
        bio: "Production profile content",
        employeeCode: "EMP001",
        fullNameFromHR: "Alice Nguyen",
        corporateEmail: "alice@company.test",
        departmentName: "Engineering",
        unitCode: "ENG",
        status: "online",
      }),
    });
  });

  await page.route("**/me/settings", async (route) => {
    await route.fulfill({
      json: success({
        version: 1,
        schemaVersion: 1,
        updatedAt: "2026-04-21T09:00:00.000Z",
        language: "en",
        appearance: {
          theme: "light",
          accentColor: "blue",
          fontSize: "medium",
          displayDensity: "comfortable",
        },
        notifications: {
          enabled: true,
          sound: true,
          messagePreview: true,
        },
        privacy: {
          showOnlineStatus: true,
          readReceipts: true,
          allowStrangersMessage: false,
        },
        chat: {
          autoScrollOnNewMessage: true,
          enterKeyAction: "send",
          saveSearchHistory: true,
        },
      }),
    });
  });

  await page.route("**/friends/blocked", async (route) => {
    await route.fulfill({
      json: success({
        data: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      }),
    });
  });

  await page.goto("/settings");

  await expect(page.locator('[data-settings-shell="true"]')).toBeVisible();
  await expect(page.locator('[data-settings-pane="content"]')).toBeVisible();
  await expect(page.locator('[data-settings-pane="nav"]')).toBeVisible();
  await expect(page.locator('[data-settings-scroll-root="true"]')).toHaveCount(1);

  const before = await page.evaluate(() => ({
    bodyOverflow: getComputedStyle(document.body).overflowY,
    htmlOverflow: getComputedStyle(document.documentElement).overflowY,
    shell: (() => {
      const element = document.querySelector('[data-settings-shell="true"]') as HTMLElement | null;
      return {
        clientHeight: element?.clientHeight ?? 0,
        scrollHeight: element?.scrollHeight ?? 0,
      };
    })(),
    content: (() => {
      const element = document.querySelector('[data-settings-pane="content"]') as HTMLElement | null;
      return {
        clientHeight: element?.clientHeight ?? 0,
        scrollHeight: element?.scrollHeight ?? 0,
        overflowY: element ? getComputedStyle(element).overflowY : "missing",
      };
    })(),
  }));

  expect(before.bodyOverflow).toBe("hidden");
  expect(before.htmlOverflow).toBe("hidden");
  expect(before.content.overflowY).toBe("auto");
  expect(before.content.scrollHeight).toBeGreaterThan(before.content.clientHeight);
  expect(Math.abs(before.shell.scrollHeight - before.shell.clientHeight)).toBeLessThan(4);

  await page.locator('[data-settings-pane="content"]').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });

  const after = await page.evaluate(() => ({
    bodyScrollTop: document.body.scrollTop,
    documentScrollTop: document.documentElement.scrollTop,
    contentScrollTop: (
      document.querySelector('[data-settings-pane="content"]') as HTMLElement | null
    )?.scrollTop ?? 0,
  }));

  expect(after.bodyScrollTop).toBe(0);
  expect(after.documentScrollTop).toBe(0);
  expect(after.contentScrollTop).toBeGreaterThan(0);
});
