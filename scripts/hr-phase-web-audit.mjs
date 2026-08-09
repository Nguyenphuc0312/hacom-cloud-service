import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
const chatBaseUrl = process.env.CHAT_WEB_URL || "http://localhost:5100";
const hrBaseUrl = process.env.HR_WEB_URL || "http://localhost:5173";
const screenshotDir =
  process.env.E2E_SCREENSHOT_DIR ||
  path.join(os.tmpdir(), "hacom-hr-phase-web-audit");

if (!email || !password) {
  throw new Error("E2E_EMAIL and E2E_PASSWORD are required.");
}

const routeWaitMs = Number(process.env.E2E_ROUTE_WAIT_MS || 1200);

function sanitizeUrl(value) {
  try {
    const url = new URL(value);
    for (const key of ["token", "access_token", "refreshToken", "refresh_token"]) {
      if (url.searchParams.has(key)) url.searchParams.set(key, "[redacted]");
    }
    return url.toString();
  } catch {
    return value;
  }
}

function sanitizeText(value) {
  return value.replace(/\s+/g, " ").trim().slice(0, 280);
}

function sanitizeDiagnosticValue(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "[redacted-email]";
    if (/password|token|secret|credential|cookie/i.test(value)) return "[redacted]";
    return sanitizeText(value);
  }
  if (typeof value !== "object") return value;
  if (depth >= 3) return "[object]";
  if (Array.isArray(value)) {
    return value.slice(0, 8).map((item) => sanitizeDiagnosticValue(item, depth + 1));
  }

  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 16)
      .map(([key, item]) => {
        if (key === "key" && typeof item === "string") {
          return [key, sanitizeText(item)];
        }

        return [
          key,
          /password|token|secret|credential|cookie|authorization|email/i.test(key)
            ? "[redacted]"
            : sanitizeDiagnosticValue(item, depth + 1),
        ];
      }),
  );
}

async function serializeConsoleArgument(argument) {
  try {
    return sanitizeDiagnosticValue(await argument.jsonValue());
  } catch {
    return "[unserializable]";
  }
}

function attachDiagnostics(page, bucket, appName) {
  page.on("console", async (message) => {
    if (!["error", "warning"].includes(message.type())) return;
    const text = message.text();
    if (/Download the React DevTools|vite|hmr/i.test(text)) return;
    const args = await Promise.all(
      message.args().slice(0, 4).map((argument) => serializeConsoleArgument(argument)),
    ).catch(() => []);
    bucket.console.push({
      app: appName,
      type: message.type(),
      text: sanitizeText(text),
      args,
    });
  });

  page.on("pageerror", (error) => {
    bucket.pageErrors.push({
      app: appName,
      message: sanitizeText(error.message),
      stack: sanitizeText(error.stack || ""),
    });
  });

  page.on("response", (response) => {
    const status = response.status();
    if (status < 400) return;
    const url = response.url();
    if (/\.(png|jpg|jpeg|svg|ico|css|js|map|woff2?)(\?|$)/i.test(url)) return;
    bucket.httpFailures.push({
      app: appName,
      status,
      method: response.request().method(),
      url: sanitizeUrl(url),
    });
  });
}

async function waitForSettled(page) {
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => undefined);
  await page.waitForTimeout(routeWaitMs);
}

async function fillFirstVisible(locator, value) {
  const count = await locator.count();
  for (let i = 0; i < count; i += 1) {
    const item = locator.nth(i);
    if (await item.isVisible().catch(() => false)) {
      await item.fill(value);
      return;
    }
  }
  throw new Error("No visible input found.");
}

async function loginHr(page) {
  await page.goto(`${hrBaseUrl}/login`, { waitUntil: "domcontentloaded" });
  await waitForSettled(page);
  await fillFirstVisible(
    page.locator(
      'input[name="loginIdentifier"], input[autocomplete*="username"], input[type="email"], input[type="text"]',
    ),
    email,
  );
  await fillFirstVisible(page.locator('input[type="password"]'), password);
  await page.locator('button[type="submit"], button:has-text("Đăng nhập")').first().click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 20_000 }).catch(() => undefined);
  await waitForSettled(page);
}

async function loginChat(page) {
  await page.goto(`${chatBaseUrl}/login`, { waitUntil: "domcontentloaded" });
  await waitForSettled(page);
  await fillFirstVisible(page.locator("#loginIdentifier, input[autocomplete*=\"username\"], input[type=\"text\"]"), email);
  await fillFirstVisible(page.locator("#password, input[type=\"password\"]"), password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 25_000 }).catch(() => undefined);
  await waitForSettled(page);
}

async function collectUiMetrics(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return (
        rect.width > 1 &&
        rect.height > 1 &&
        style.visibility !== "hidden" &&
        style.display !== "none"
      );
    };

    const candidates = Array.from(
      document.querySelectorAll(
        [
          "button",
          "a",
          "input",
          "select",
          "textarea",
          "[role='button']",
          "[role='tab']",
          "th",
          "td",
          "label",
          "h1",
          "h2",
          "h3",
          ".ant-tag",
          ".mantine-Badge-root",
          ".mantine-Button-root",
        ].join(","),
      ),
    );

    const textOverflows = candidates
      .filter((element) => visible(element))
      .filter((element) => !element.closest("[data-loading], [aria-busy='true']"))
      .filter((element) => {
        const style = window.getComputedStyle(element);
        const hasSingleLineOverflow =
          element.scrollWidth > element.clientWidth + 2 &&
          style.overflowX !== "visible";
        const hasVerticalOverflow =
          element.scrollHeight > element.clientHeight + 3 &&
          style.overflowY !== "visible";
        return hasSingleLineOverflow || hasVerticalOverflow;
      })
      .slice(0, 20)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          text: (element.textContent || element.getAttribute("placeholder") || "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 120),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          scrollWidth: element.scrollWidth,
          scrollHeight: element.scrollHeight,
          className: String(element.className || "").slice(0, 120),
        };
      });

    const bodyText = document.body.innerText || "";
    const alerts = Array.from(
      document.querySelectorAll(
        "[role='alert'], .ant-alert, .mantine-Alert-root, [class*='error'], [class*='Error']",
      ),
    )
      .filter((element) => visible(element))
      .map((element) => (element.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, 10);

    return {
      title: document.title,
      h1: document.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim() || null,
      bodySnippet: bodyText.replace(/\s+/g, " ").trim().slice(0, 400),
      horizontalOverflow:
        document.documentElement.scrollWidth > window.innerWidth + 2 ||
        document.body.scrollWidth > window.innerWidth + 2,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
      },
      alerts,
      textOverflows,
    };
  });
}

async function auditRoute(page, appName, name, urlPath, viewportName) {
  const fullUrl = `${appName === "hr-web" ? hrBaseUrl : chatBaseUrl}${urlPath}`;
  await page.goto(fullUrl, { waitUntil: "domcontentloaded" });
  await waitForSettled(page);
  const safeName = `${appName}-${viewportName}-${name}`.replace(/[^a-z0-9_-]+/gi, "-");
  const screenshotPath = path.join(screenshotDir, `${safeName}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  const metrics = await collectUiMetrics(page);
  return {
    app: appName,
    viewport: viewportName,
    name,
    expectedPath: urlPath,
    finalUrl: sanitizeUrl(page.url()),
    screenshotPath,
    metrics,
  };
}

async function runForViewport(browser, viewportName, viewport) {
  const context = await browser.newContext({
    viewport,
    ignoreHTTPSErrors: true,
    locale: "vi-VN",
  });
  const diagnostics = { console: [], pageErrors: [], httpFailures: [] };
  const results = [];

  const hrPage = await context.newPage();
  attachDiagnostics(hrPage, diagnostics, "hr-web");
  await loginHr(hrPage);
  results.push(await auditRoute(hrPage, "hr-web", "dashboard", "/dashboard", viewportName));
  results.push(await auditRoute(hrPage, "hr-web", "timesheet-grid", "/attendance/timesheet", viewportName));
  results.push(await auditRoute(hrPage, "hr-web", "timesheet-periods", "/attendance/periods", viewportName));
  results.push(await auditRoute(hrPage, "hr-web", "leave", "/leave", viewportName));
  await hrPage.close();

  const chatPage = await context.newPage();
  attachDiagnostics(chatPage, diagnostics, "chat-web");
  await loginChat(chatPage);
  results.push(await auditRoute(chatPage, "chat-web", "timesheet", "/timesheet", viewportName));
  results.push(await auditRoute(chatPage, "chat-web", "leave", "/leave", viewportName));
  results.push(await auditRoute(chatPage, "chat-web", "team-timesheet", "/timesheet/team", viewportName));
  await chatPage.close();

  await context.close();
  return { viewport: viewportName, results, diagnostics };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  await import("node:fs/promises").then((fs) => fs.mkdir(screenshotDir, { recursive: true }));

  const runs = [];
  for (const [name, viewport] of [
    ["desktop", { width: 1440, height: 1000 }],
    ["mobile", { width: 390, height: 844 }],
  ]) {
    runs.push(await runForViewport(browser, name, viewport));
  }

  await browser.close();

  const summary = {
    screenshotDir,
    chatBaseUrl,
    hrBaseUrl,
    runs,
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
