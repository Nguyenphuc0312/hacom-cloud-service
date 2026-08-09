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
const mutatingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const ignoredMutationUrls = [/\/auth(\/|$)/i, /\/login(\/|$)/i, /\/refresh(\/|$)/i];

const routeExpectations = {
  "hr-web:dashboard": {
    requiredText: [
      "Dashboard",
      "Tổng nhân sự",
      "Nhân sự theo đơn vị",
      "Chuẩn bị bàn giao lương",
      "Chuyên cần theo đơn vị",
    ],
    forbiddenText: [
      "Tong nhan su",
      "Chuan bi ban giao luong",
      "Chuyen can theo don vi",
      "Dang doi chieu CSV",
    ],
  },
  "hr-web:timesheet-grid": {
    requiredText: [
      "Bảng chấm công tháng",
      "Tháng",
      "Năm",
      "Phòng ban",
      "Tính lại tháng này",
    ],
  },
  "hr-web:timesheet-periods": {
    requiredText: [
      "Quản lý kỳ công",
      "Mở kỳ công",
      "Tải lại",
      "Kỳ",
      "Phạm vi",
      "Trạng thái",
      "Hạn xác nhận",
      "Số nhân viên",
    ],
  },
  "hr-web:leave": {
    requiredText: [
      "Quản lý nghỉ phép",
      "Danh sách đơn nghỉ phép",
      "Danh mục ký hiệu nghỉ phép",
      "Tạo đơn",
      "Nhân viên",
      "Loại nghỉ",
      "Trạng thái",
    ],
    forbiddenText: [
      "Create leave request",
      "Leave request list",
      "Leave policy types",
      "Employee",
      "Leave type",
      "Start date",
      "End date",
      "Save request",
    ],
  },
  "chat-web:timesheet": {
    requiredText: [
      "Công của tôi",
      "Tháng",
      "Tải lại",
      "Nhóm của tôi",
      "Xác nhận",
      "Khiếu nại",
      "Gửi HR",
    ],
  },
  "chat-web:leave": {
    requiredText: [
      "Nghỉ phép của tôi",
      "Năm",
      "Tải lại",
      "Đơn nghỉ phép",
      "Gửi đơn nghỉ",
      "Loại nghỉ",
      "Chứng từ/URL",
      "Gửi đơn",
    ],
    forbiddenText: ["Chung tu/URL", "Bat buoc voi nghi om tu 3 ngay"],
  },
  "chat-web:team-timesheet": {
    requiredText: [
      "Nhóm của tôi",
      "Tháng",
      "Tải lại",
      "Công của tôi",
      "Tổng nhân viên",
      "Đã xác nhận",
      "Chưa xác nhận",
      "Khiếu nại",
    ],
  },
};

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

  page.on("request", (request) => {
    const method = request.method().toUpperCase();
    if (!mutatingMethods.has(method)) return;
    const url = request.url();
    if (ignoredMutationUrls.some((pattern) => pattern.test(url))) return;
    bucket.mutations.push({
      app: appName,
      method,
      url: sanitizeUrl(url),
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

function routeKey(appName, routeName) {
  return `${appName}:${routeName}`;
}

async function bodyText(page) {
  return page.locator("body").innerText({ timeout: 5_000 });
}

async function ensureLocatorVisible(locator, label, timeout = 5_000) {
  const item = locator.first();
  await item.waitFor({ state: "visible", timeout });
  return item;
}

async function ensureText(page, text, label = text) {
  return ensureLocatorVisible(page.getByText(text, { exact: false }), label);
}

async function ensureButton(page, name, label = `button ${String(name)}`) {
  return ensureLocatorVisible(page.getByRole("button", { name }), label);
}

async function clickButton(page, name, label = `button ${String(name)}`) {
  const button = await ensureButton(page, name, label);
  await button.click();
  await waitForSettled(page);
  return button;
}

async function assertBodyIncludes(page, phrases) {
  const text = await bodyText(page);
  const missing = phrases.filter((phrase) => !text.includes(phrase));
  if (missing.length > 0) {
    throw new Error(`Missing visible text: ${missing.join(", ")}`);
  }
}

async function assertBodyExcludes(page, phrases) {
  const text = await bodyText(page);
  const present = phrases.filter((phrase) => text.includes(phrase));
  if (present.length > 0) {
    throw new Error(`Unexpected visible text: ${present.join(", ")}`);
  }
}

async function recordCheck(checks, name, fn) {
  try {
    await fn();
    checks.push({ name, status: "passed" });
  } catch (error) {
    checks.push({
      name,
      status: "failed",
      message: sanitizeText(error?.message || String(error)),
    });
  }
}

function assertNoMatchingMutation(diagnostics, beforeCount, matcher, label) {
  const matches = diagnostics.mutations.slice(beforeCount).filter((entry) => matcher.test(entry.url));
  if (matches.length > 0) {
    throw new Error(
      `${label} unexpectedly sent ${matches.length} mutating request(s): ${matches
        .map((entry) => `${entry.method} ${entry.url}`)
        .join("; ")}`,
    );
  }
}

async function assertRouteStillAvailable(page, expectedPath) {
  const url = new URL(page.url());
  if (url.pathname.includes("/login")) {
    throw new Error(`Route redirected to login instead of staying on ${expectedPath}.`);
  }
  if (!url.pathname.endsWith(expectedPath)) {
    throw new Error(`Expected path ${expectedPath}, got ${url.pathname}.`);
  }
}

async function runExpectationChecks(page, appName, routeName, expectedPath, checks) {
  const expectation = routeExpectations[routeKey(appName, routeName)];
  await recordCheck(checks, "route stays authenticated", () =>
    assertRouteStillAvailable(page, expectedPath),
  );
  if (!expectation) return;

  await recordCheck(checks, "required visible text", () =>
    assertBodyIncludes(page, expectation.requiredText ?? []),
  );

  if (expectation.forbiddenText?.length) {
    await recordCheck(checks, "stale labels are absent", () =>
      assertBodyExcludes(page, expectation.forbiddenText),
    );
  }
}

async function runInteractionChecks(page, appName, routeName, diagnostics, checks) {
  if (appName === "hr-web" && routeName === "timesheet-periods") {
    await recordCheck(checks, "reload periods", () => clickButton(page, /Tải lại/i));
    await recordCheck(checks, "open period modal fields", async () => {
      await clickButton(page, /Mở kỳ công/i);
      await assertBodyIncludes(page, ["Mở kỳ công", "Tháng", "Năm", "Phạm vi", "Hạn xác nhận", "Mở kỳ"]);
      await clickButton(page, /Hủy/i);
    });
    await recordCheck(checks, "confirmation modal is inspectable when rows exist", async () => {
      const confirmationButtons = page.getByRole("button", { name: /^Xác nhận$/ });
      const count = await confirmationButtons.count();
      if (count === 0) return;
      await confirmationButtons.first().click();
      await waitForSettled(page);
      await assertBodyIncludes(page, ["Chưa xác nhận", "Đã xác nhận", "Khiếu nại"]);
      await page.keyboard.press("Escape");
      await waitForSettled(page);
    });
  }

  if (appName === "hr-web" && routeName === "leave") {
    await recordCheck(checks, "open leave drawer and validate empty form", async () => {
      await clickButton(page, /Tạo đơn/i);
      await assertBodyIncludes(page, ["Tạo đơn nghỉ phép", "Nhân viên", "Loại nghỉ", "Từ ngày", "Đến ngày", "Lý do"]);
      const before = diagnostics.mutations.length;
      await clickButton(page, /Lưu đơn/i);
      await assertBodyIncludes(page, [
        "Chọn nhân viên.",
        "Chọn loại nghỉ.",
        "Nhập ngày bắt đầu.",
        "Nhập ngày kết thúc.",
        "Tổng số ngày tối thiểu là 0.5.",
        "Nhập lý do nghỉ phép.",
      ]);
      assertNoMatchingMutation(diagnostics, before, /\/leave\/requests/i, "HR leave empty validation");
      await clickButton(page, /Hủy/i);
    });
  }

  if (appName === "chat-web" && routeName === "timesheet") {
    await recordCheck(checks, "reload my timesheet", () => clickButton(page, /Tải lại/i));
    await recordCheck(checks, "timesheet action surface", async () => {
      await ensureButton(page, /^Xác nhận$/i);
      await ensureButton(page, /^Gửi HR$/i);
      await ensureLocatorVisible(page.locator("textarea").first(), "dispute textarea");
    });
  }

  if (appName === "chat-web" && routeName === "leave") {
    await recordCheck(checks, "reload my leave", () => clickButton(page, /Tải lại/i));
    await recordCheck(checks, "leave request form fields", async () => {
      await ensureLocatorVisible(page.locator('select').first(), "leave type select");
      await ensureLocatorVisible(page.locator('input[type="date"]').first(), "start date input");
      await ensureLocatorVisible(page.locator('input[type="date"]').nth(1), "end date input");
      await ensureLocatorVisible(page.locator("textarea").first(), "reason textarea");
      const attachmentInput = await ensureLocatorVisible(
        page.locator('input[type="url"]').first(),
        "attachment url input",
      );
      const placeholder = await attachmentInput.getAttribute("placeholder");
      if (placeholder !== "Bắt buộc với nghỉ ốm từ 3 ngày") {
        throw new Error(`Unexpected attachment placeholder: ${placeholder ?? "[empty]"}`);
      }
      await ensureButton(page, /^Gửi đơn$/i);
    });
  }

  if (appName === "chat-web" && routeName === "team-timesheet") {
    await recordCheck(checks, "reload team timesheet", () => clickButton(page, /Tải lại/i));
    await recordCheck(checks, "team navigation link back to personal timesheet", () =>
      ensureLocatorVisible(page.getByRole("link", { name: /Công của tôi/i }), "personal timesheet link"),
    );
  }
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

async function auditRoute(page, appName, name, urlPath, viewportName, diagnostics) {
  const fullUrl = `${appName === "hr-web" ? hrBaseUrl : chatBaseUrl}${urlPath}`;
  await page.goto(fullUrl, { waitUntil: "domcontentloaded" });
  await waitForSettled(page);
  const checks = [];
  await runExpectationChecks(page, appName, name, urlPath, checks);
  await runInteractionChecks(page, appName, name, diagnostics, checks);
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
    checks,
    metrics,
  };
}

async function runForViewport(browser, viewportName, viewport) {
  const context = await browser.newContext({
    viewport,
    ignoreHTTPSErrors: true,
    locale: "vi-VN",
  });
  const diagnostics = { console: [], pageErrors: [], httpFailures: [], mutations: [] };
  const results = [];

  const hrPage = await context.newPage();
  attachDiagnostics(hrPage, diagnostics, "hr-web");
  await loginHr(hrPage);
  results.push(await auditRoute(hrPage, "hr-web", "dashboard", "/dashboard", viewportName, diagnostics));
  results.push(await auditRoute(hrPage, "hr-web", "timesheet-grid", "/attendance/timesheet", viewportName, diagnostics));
  results.push(await auditRoute(hrPage, "hr-web", "timesheet-periods", "/attendance/periods", viewportName, diagnostics));
  results.push(await auditRoute(hrPage, "hr-web", "leave", "/leave", viewportName, diagnostics));
  await hrPage.close();

  const chatPage = await context.newPage();
  attachDiagnostics(chatPage, diagnostics, "chat-web");
  await loginChat(chatPage);
  results.push(await auditRoute(chatPage, "chat-web", "timesheet", "/timesheet", viewportName, diagnostics));
  results.push(await auditRoute(chatPage, "chat-web", "leave", "/leave", viewportName, diagnostics));
  results.push(await auditRoute(chatPage, "chat-web", "team-timesheet", "/timesheet/team", viewportName, diagnostics));
  await chatPage.close();

  await context.close();
  return { viewport: viewportName, results, diagnostics };
}

function collectFailures(summary) {
  const failures = [];
  for (const run of summary.runs) {
    for (const item of run.diagnostics.console) {
      failures.push({
        viewport: run.viewport,
        app: item.app,
        type: "console",
        message: item.text,
      });
    }
    for (const item of run.diagnostics.pageErrors) {
      failures.push({
        viewport: run.viewport,
        app: item.app,
        type: "pageerror",
        message: item.message,
      });
    }
    for (const item of run.diagnostics.httpFailures) {
      failures.push({
        viewport: run.viewport,
        app: item.app,
        type: "http",
        message: `${item.method} ${item.status} ${item.url}`,
      });
    }
    for (const route of run.results) {
      for (const check of route.checks.filter((item) => item.status !== "passed")) {
        failures.push({
          viewport: run.viewport,
          app: route.app,
          route: route.name,
          type: "check",
          message: `${check.name}: ${check.message}`,
        });
      }
      if (route.metrics.horizontalOverflow) {
        failures.push({
          viewport: run.viewport,
          app: route.app,
          route: route.name,
          type: "layout",
          message: `horizontal overflow: viewport ${route.metrics.viewport.width}, document ${route.metrics.viewport.documentWidth}, body ${route.metrics.viewport.bodyWidth}`,
        });
      }
      for (const overflow of route.metrics.textOverflows) {
        failures.push({
          viewport: run.viewport,
          app: route.app,
          route: route.name,
          type: "text-overflow",
          message: `${overflow.tag} "${overflow.text}" ${overflow.width}x${overflow.height} scroll ${overflow.scrollWidth}x${overflow.scrollHeight}`,
        });
      }
    }
  }
  return failures;
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
  summary.failures = collectFailures(summary);
  summary.ok = summary.failures.length === 0;
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
