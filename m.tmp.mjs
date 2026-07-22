import { chromium } from "playwright";
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
const p = await c.newPage();
await p.goto("http://localhost:5100/login", { waitUntil: "networkidle" });
await p.locator('input[type="text"], input[type="email"]').first().fill("minhnhatcff@gmail.com");
await p.locator('input[type="password"]').first().fill("123456Aa@");
await p.getByRole("button", { name: /Đăng nhập/i }).first().click();
await p.waitForURL(/\/chat/, { timeout: 30000 }).catch(()=>{});
await p.waitForTimeout(4000);
// Open the first conversation row that has an avatar+preview
const row = p.locator('div[class*="rounded"]:has(img)').filter({ hasText: /:/ }).first();
await row.click({ force: true }).catch(async()=>{ await p.locator("li,button").nth(5).click({force:true}).catch(()=>{}); });
await p.waitForTimeout(6000);
const has = await p.locator('[data-testid="simple-timeline-scroll"]').count();
console.log("timeline:", has, "url:", p.url());
if (has) console.log(await p.evaluate(() => {
  const sc = document.querySelector('[data-testid="simple-timeline-scroll"]');
  const sr = sc.getBoundingClientRect();
  const over = [];
  for (const e of sc.querySelectorAll("*")) {
    const r = e.getBoundingClientRect();
    const d = Math.round(r.right - sr.right);
    if (d > 0) over.push({ d, cls: String(e.className).slice(0,70), pos: getComputedStyle(e).position, w: Math.round(r.width) });
  }
  over.sort((a,b)=>b.d-a.d);
  return JSON.stringify({ clientW: sc.clientWidth, scrollW: sc.scrollWidth,
    hScroll: sc.scrollWidth - sc.clientWidth, overflowing: over.slice(0,5) }, null, 1);
}));
await b.close();
