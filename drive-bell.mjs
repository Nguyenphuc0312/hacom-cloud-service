import { chromium } from "playwright-core";

const OUT = process.argv[2] || "./shots";
const now = Date.now();
const ago = (min) => new Date(now - min * 60000).toISOString();

const live = [
  {
    id: "n1",
    type: "calendar.meeting.participant_responded",
    title: "Cập nhật phản hồi lịch họp",
    body: "Nguyễn Thế Huy Hoàng đã từ chối tham gia lịch họp: Hội ý nhóe — Lý do: Không thích lam",
    actorName: "Nguyễn Thế Huy Hoàng",
    entityType: "CALENDAR_EVENT",
    entityId: "e1",
    payload: {
      eventTitle: "Hội ý nhóe",
      response: "DECLINED",
      isOwnEvent: true,
      actorAuthUserId: "auth-huy",
    },
    readAt: null,
    createdAt: ago(30),
  },
  {
    id: "n2",
    type: "calendar.meeting.participant_responded",
    title: "Cập nhật phản hồi lịch họp",
    body: "Đậu Cao Minh Nhật đã xác nhận tham gia lịch họp: Họp Bộ phận CĐS",
    actorName: "Đậu Cao Minh Nhật",
    entityType: "CALENDAR_EVENT",
    entityId: "e2",
    payload: { eventTitle: "Họp Bộ phận CĐS", response: "ACCEPTED", isOwnEvent: true },
    readAt: ago(10),
    createdAt: ago(120),
  },
  {
    id: "n3",
    type: "calendar.meeting.invited",
    title: "Bạn được mời tham gia lịch họp",
    body: "Trần Đăng Công đã mời bạn tham gia: Họp giao ban tuần 32",
    actorName: "Trần Đăng Công",
    entityType: "CALENDAR_EVENT",
    entityId: "e3",
    payload: { eventTitle: "Họp giao ban tuần 32", isOwnEvent: false },
    readAt: ago(10),
    createdAt: ago(60 * 26),
  },
  {
    id: "n4",
    type: "calendar.meeting.updated",
    title: "Lịch họp đã được cập nhật",
    body: "Trần Vũ Đại đã cập nhật lịch họp: Review sprint",
    actorName: "Trần Vũ Đại",
    entityType: "CALENDAR_EVENT",
    entityId: "e4",
    payload: { eventTitle: "Review sprint", isOwnEvent: false },
    readAt: ago(200),
    createdAt: ago(60 * 50),
  },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 760, height: 700 } });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));

await page.route("**/hr-api/v1/notifications**", async (route) => {
  const url = route.request().url();
  if (url.includes("unread-count")) {
    return route.fulfill({
      json: { success: true, data: { count: live.filter((n) => !n.readAt).length } },
    });
  }
  return route.fulfill({
    json: { success: true, data: { items: live, pagination: {} } },
  });
});

await page.goto("http://localhost:5100/bell-preview.html", {
  waitUntil: "networkidle",
});
await page.locator('button[title="Thông báo lịch họp"]').click();
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/current.png` });
console.log("shot: current");
await browser.close();
