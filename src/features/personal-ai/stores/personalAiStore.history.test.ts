import { describe, it, expect, beforeEach } from "vitest";
import { usePersonalAiStore } from "./personalAiStore";
import type { PersonalChatMessage } from "../types";

function msg(id: string, content = id): PersonalChatMessage {
  return {
    id,
    role: "assistant",
    content,
    timestamp: new Date(),
    isStreaming: false,
    thinkingPhase: null,
  } as PersonalChatMessage;
}

/**
 * Prepend lịch sử cũ (§5). Bug được chặn ở đây: trước kia
 * `loadMessagesForConversation` chỉ nạp khi hội thoại RỖNG, nên cuộn lên tải
 * trang cũ là không có gì xảy ra — và nếu nạp thẳng thì sẽ đè mất phần đang
 * hiển thị (kể cả message đang stream).
 */
describe("loadMessagesForConversation — prepend trang lịch sử cũ", () => {
  let convId: string;

  beforeEach(() => {
    usePersonalAiStore.getState().clearStore();
    convId = usePersonalAiStore.getState().createConversation();
  });

  const messagesOf = () =>
    usePersonalAiStore
      .getState()
      .conversations.find((c) => c.id === convId)!
      .messages.map((m) => m.id);

  it("nạp thẳng khi hội thoại còn rỗng", () => {
    usePersonalAiStore
      .getState()
      .loadMessagesForConversation(convId, [msg("a"), msg("b")]);
    expect(messagesOf()).toEqual(["a", "b"]);
  });

  it("đặt message cũ hơn LÊN TRƯỚC phần đang hiển thị", () => {
    const store = usePersonalAiStore.getState();
    store.loadMessagesForConversation(convId, [msg("c"), msg("d")]);
    store.loadMessagesForConversation(convId, [msg("a"), msg("b")]);
    expect(messagesOf()).toEqual(["a", "b", "c", "d"]);
  });

  it("loại trùng theo id — tải lại cùng trang không nhân đôi", () => {
    const store = usePersonalAiStore.getState();
    store.loadMessagesForConversation(convId, [msg("c"), msg("d")]);
    store.loadMessagesForConversation(convId, [msg("b"), msg("c")]);
    expect(messagesOf()).toEqual(["b", "c", "d"]);
  });

  it("giữ NGUYÊN REFERENCE của message cũ để React.memo còn ăn", () => {
    const store = usePersonalAiStore.getState();
    store.loadMessagesForConversation(convId, [msg("c")]);
    const before = usePersonalAiStore
      .getState()
      .conversations.find((c) => c.id === convId)!.messages[0];

    store.loadMessagesForConversation(convId, [msg("a")]);
    const after = usePersonalAiStore
      .getState()
      .conversations.find((c) => c.id === convId)!.messages[1];

    expect(after).toBe(before);
  });

  it("trang cũ không có gì mới → không đụng vào state", () => {
    const store = usePersonalAiStore.getState();
    store.loadMessagesForConversation(convId, [msg("c"), msg("d")]);
    const before = usePersonalAiStore
      .getState()
      .conversations.find((c) => c.id === convId)!;

    store.loadMessagesForConversation(convId, [msg("c")]);
    const after = usePersonalAiStore
      .getState()
      .conversations.find((c) => c.id === convId)!;

    expect(after).toBe(before);
  });
});
