import { chromium } from "playwright";
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
const p = await c.newPage();
await p.goto("http://localhost:5100/login", { waitUntil: "networkidle" });
await p.locator('input[type="text"], input[type="email"]').first().fill("minhnhatcff@gmail.com");
await p.locator('input[type="password"]').first().fill("123456Aa@");
await p.getByRole("button", { name: /Đăng nhập/i }).first().click();
await p.waitForURL(/\/chat/, { timeout: 30000 }).catch(()=>{});
await p.waitForTimeout(3000);
await p.getByText("Core Hacom", { exact: false }).first().click();
await p.waitForTimeout(6000);
console.log(await p.evaluate(() => {
  const bar = document.querySelector('[role="toolbar"][aria-label="Chọn cảm xúc"]');
  if (!bar) return "NO BAR IN DOM";
  // Force it visible the way hover does, then measure against the scroll container.
  bar.style.opacity = "1"; bar.style.pointerEvents = "auto";
  const rc = bar.getBoundingClientRect();
  const sc = document.querySelector('[data-testid="simple-timeline-scroll"]');
  const sr = sc.getBoundingClientRect();
  return JSON.stringify({
    bar: { w: Math.round(rc.width), left: Math.round(rc.left), right: Math.round(rc.right), top: Math.round(rc.top) },
    scroller: { left: Math.round(sr.left), right: Math.round(sr.right), top: Math.round(sr.top) },
    overflowsRight: Math.round(rc.right - sr.right),
    overflowsTop: Math.round(sr.top - rc.top),
    scrollerOverflowX: getComputedStyle(sc).overflowX,
  }, null, 1);
}));
await b.close();
