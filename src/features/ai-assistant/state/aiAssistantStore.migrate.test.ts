import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Kiểm chứng migration v1: dọn hội thoại company di sản dùng chung
 * serverSessionId `chat-{user}-default`. Test này nạp localStorage GIẢ rồi
 * import store để onRehydrate/migrate chạy, và xác nhận kết quả.
 */

const STORAGE_KEY = "hacom-ai-assistant-storage";

beforeEach(() => {
  localStorage.clear();
  // reset module để store khởi tạo lại và chạy migrate trên dữ liệu mới seed
  vi.resetModules();
});

function seed(conversations: unknown[], version = 0) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ state: { conversations }, version }),
  );
}

describe("aiAssistantStore migrate v1 — dọn cuộc -default", () => {
  it("xóa cuộc company có serverSessionId kết thúc -default, giữ cuộc UUID", async () => {
    seed([
      { id: "a", title: "Cũ default", endpoint: "company", messages: [], serverSessionId: "chat-HC1-default", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: "b", title: "Mới uuid", endpoint: "company", messages: [], serverSessionId: "chat-HC1-a3f9", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: "c", title: "Personal", endpoint: "personal", messages: [], serverSessionId: "personal-HC1-default", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ], 0);

    const { useAiAssistantStore } = await import("./aiAssistantStore");
    // chờ rehydrate (persist async)
    await useAiAssistantStore.persist.rehydrate();

    const convs = useAiAssistantStore.getState().conversations;
    expect(convs.find((c) => c.id === "a")).toBeUndefined(); // -default company → xóa
    expect(convs.find((c) => c.id === "b")).toBeTruthy();     // UUID company → giữ
    expect(convs.find((c) => c.id === "c")).toBeTruthy();     // personal → không đụng
  });

  it("không đụng dữ liệu khi version đã >= 1", async () => {
    seed([
      { id: "a", title: "default nhưng đã migrate", endpoint: "company", messages: [], serverSessionId: "chat-HC1-default", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ], 1);

    const { useAiAssistantStore } = await import("./aiAssistantStore");
    await useAiAssistantStore.persist.rehydrate();

    const convs = useAiAssistantStore.getState().conversations;
    expect(convs.find((c) => c.id === "a")).toBeTruthy();
  });
});
