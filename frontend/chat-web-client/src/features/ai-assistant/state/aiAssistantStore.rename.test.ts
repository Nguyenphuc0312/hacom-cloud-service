import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Kiểm chứng bug "đổi tên xong reload là mất tên": sau khi user rename, dữ liệu
 * server (loadServerSessions) KHÔNG được ghi đè tên user tự đặt.
 */

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

const OWNER = "HC1";

describe("aiAssistantStore — rename giữ được sau khi load server sessions", () => {
  it("giữ tên user đặt dù server trả tên cũ (BE chưa lưu rename)", async () => {
    const { useAiAssistantStore } = await import("./aiAssistantStore");
    const store = useAiAssistantStore.getState();

    // Seed 1 conversation company đã có serverSessionId + tên cũ từ server.
    store.setOwnerId(OWNER);
    store.loadServerSessions(
      [{ session_id: "s1", title: "Tên cũ", updated_at: "2026-01-01T00:00:00Z" }],
      "company",
      OWNER,
    );
    const convId = useAiAssistantStore
      .getState()
      .conversations.find((c) => c.serverSessionId === "s1")!.id;

    // User đổi tên.
    store.renameConversation(convId, "Tên mới của tôi");
    expect(
      useAiAssistantStore.getState().conversations.find((c) => c.id === convId)!
        .titleRenamed,
    ).toBe(true);

    // Reload: server VẪN trả tên cũ (endpoint chưa lưu rename).
    store.loadServerSessions(
      [{ session_id: "s1", title: "Tên cũ", updated_at: "2026-01-01T00:00:00Z" }],
      "company",
      OWNER,
    );

    const after = useAiAssistantStore
      .getState()
      .conversations.find((c) => c.serverSessionId === "s1")!;
    expect(after.title).toBe("Tên mới của tôi");
  });

  it("vẫn nhận tên mới từ server khi user CHƯA tự đổi tên", async () => {
    const { useAiAssistantStore } = await import("./aiAssistantStore");
    const store = useAiAssistantStore.getState();

    store.setOwnerId(OWNER);
    store.loadServerSessions(
      [{ session_id: "s2", title: "Tên A" }],
      "company",
      OWNER,
    );
    // Server đổi tên (vd auto-title từ câu hỏi đầu) — chưa rename local → nhận.
    store.loadServerSessions(
      [{ session_id: "s2", title: "Tên B" }],
      "company",
      OWNER,
    );

    const conv = useAiAssistantStore
      .getState()
      .conversations.find((c) => c.serverSessionId === "s2")!;
    expect(conv.title).toBe("Tên B");
  });
});
