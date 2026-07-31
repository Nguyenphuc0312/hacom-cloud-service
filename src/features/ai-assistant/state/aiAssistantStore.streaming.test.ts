import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AiMessage } from "../types";

/**
 * Kiểm chứng phần tối ưu hiệu năng của store:
 *  1. Token streaming được GOM lại, flush 1 lần/frame (không phải 1 set()/token).
 *  2. Message cũ giữ nguyên reference qua các lần cập nhật → React.memo ăn được.
 *  3. Nạp lịch sử trang cũ hơn chỉ PREPEND phần chưa biết, không đụng phần đang có.
 */

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

const OWNER = "HC1";

function msg(id: string, role: "user" | "assistant", content: string): AiMessage {
  return { id, role, content, timestamp: new Date("2026-01-01T00:00:00Z") };
}

async function seedConversation() {
  const mod = await import("./aiAssistantStore");
  const { useAiAssistantStore } = mod;
  const store = useAiAssistantStore.getState();
  store.setOwnerId(OWNER);
  const convId = store.createNewConversation("company");
  store.addMessage(convId, msg("u1", "user", "câu hỏi"));
  store.addMessage(convId, msg("a1", "assistant", ""));
  return { ...mod, convId };
}

const currentMessages = (
  getState: () => { conversations: { id: string; messages: AiMessage[] }[] },
  convId: string,
) => getState().conversations.find((c) => c.id === convId)!.messages;

describe("aiAssistantStore — batch token streaming", () => {
  it("gom nhiều token thành MỘT lần cập nhật state", async () => {
    const { useAiAssistantStore, flushStreamBuffer, convId } =
      await seedConversation();

    let commits = 0;
    const unsub = useAiAssistantStore.subscribe(() => {
      commits++;
    });

    for (const token of ["Xin", " ", "chào", " bạn"]) {
      useAiAssistantStore.getState().updateLastMessage(convId, token, true);
    }
    // Chưa flush → state chưa đổi lần nào.
    expect(commits).toBe(0);

    flushStreamBuffer();
    unsub();

    expect(commits).toBe(1);
    const messages = currentMessages(useAiAssistantStore.getState, convId);
    expect(messages[1].content).toBe("Xin chào bạn");
    expect(messages[1].isStreaming).toBe(true);
  });

  it("giữ nguyên reference của message CŨ khi message cuối đang stream", async () => {
    const { useAiAssistantStore, flushStreamBuffer, convId } =
      await seedConversation();

    const before = currentMessages(useAiAssistantStore.getState, convId)[0];

    useAiAssistantStore.getState().updateLastMessage(convId, "abc", true);
    flushStreamBuffer();

    const after = currentMessages(useAiAssistantStore.getState, convId)[0];
    expect(after).toBe(before);
  });

  it("ghi đè nội dung cuối (non-partial) xả buffer trước, không mất token treo", async () => {
    const { useAiAssistantStore, convId } = await seedConversation();

    useAiAssistantStore.getState().updateLastMessage(convId, "một phần", true);
    // Chưa flush mà đã có câu trả lời cuối cùng từ server.
    useAiAssistantStore.getState().updateLastMessage(convId, "câu trả lời đầy đủ", false);

    const messages = currentMessages(useAiAssistantStore.getState, convId);
    expect(messages[1].content).toBe("câu trả lời đầy đủ");
    expect(messages[1].isStreaming).toBe(false);
  });

  it("không ghi đè message đã có widget đặc biệt", async () => {
    const { useAiAssistantStore, flushStreamBuffer, convId } =
      await seedConversation();

    useAiAssistantStore.getState().updateMessage(convId, "a1", {
      selectionRequest: { options: [] } as never,
    });
    useAiAssistantStore.getState().updateLastMessage(convId, "token", true);
    flushStreamBuffer();

    const messages = currentMessages(useAiAssistantStore.getState, convId);
    expect(messages[1].content).toBe("");
  });
});

describe("aiAssistantStore — nạp lịch sử phân trang", () => {
  it("prepend trang cũ hơn, giữ nguyên message đang có", async () => {
    const { useAiAssistantStore, convId } = await seedConversation();

    const existing = currentMessages(useAiAssistantStore.getState, convId);
    useAiAssistantStore
      .getState()
      .loadMessagesForConversation(convId, [
        msg("old1", "user", "câu cũ"),
        msg("old2", "assistant", "trả lời cũ"),
        // Trùng với message đang có → phải bị loại, không nhân đôi.
        msg("u1", "user", "câu hỏi"),
      ]);

    const after = currentMessages(useAiAssistantStore.getState, convId);
    expect(after.map((m) => m.id)).toEqual(["old1", "old2", "u1", "a1"]);
    // Phần đang hiển thị giữ nguyên reference → row cũ không render lại.
    expect(after[2]).toBe(existing[0]);
    expect(after[3]).toBe(existing[1]);
  });

  it("nạp lần đầu vào hội thoại rỗng thì thay toàn bộ", async () => {
    const { useAiAssistantStore } = await import("./aiAssistantStore");
    const store = useAiAssistantStore.getState();
    store.setOwnerId(OWNER);
    const convId = store.createNewConversation("company");

    store.loadMessagesForConversation(convId, [
      msg("m1", "user", "a"),
      msg("m2", "assistant", "b"),
    ]);

    expect(
      currentMessages(useAiAssistantStore.getState, convId).map((m) => m.id),
    ).toEqual(["m1", "m2"]);
  });
});
