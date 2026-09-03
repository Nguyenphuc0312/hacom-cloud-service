import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { usePersonalAiStore, flushPersonalStreamBuffer } from "./personalAiStore";
import type { PersonalChatMessage } from "../types";

function assistantPlaceholder(): PersonalChatMessage {
  return {
    id: "a1",
    role: "assistant",
    content: "",
    timestamp: new Date(),
    isStreaming: true,
    thinkingPhase: null,
  } as PersonalChatMessage;
}

/**
 * Gom token streaming (§4.4). Trước kia mỗi token là một `set()` → re-render
 * toàn bộ danh sách message. Rủi ro khi gom là MẤT CHỮ: token của frame cuối
 * còn treo trong buffer lúc stream kết thúc / bấm Dừng.
 */
describe("appendToken — gom token theo frame", () => {
  let convId: string;
  /** Các callback rAF đang chờ, để test tự quyết định khi nào "sang frame". */
  let frames: FrameRequestCallback[];

  beforeEach(() => {
    frames = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      frames[id - 1] = () => {};
    });
    usePersonalAiStore.getState().clearStore();
    convId = usePersonalAiStore.getState().createConversation();
    usePersonalAiStore.getState().addMessage(convId, assistantPlaceholder());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const runFrame = () => {
    const pending = frames;
    frames = [];
    pending.forEach((cb) => cb(0));
  };

  const contentOf = () =>
    usePersonalAiStore
      .getState()
      .conversations.find((c) => c.id === convId)!
      .messages.at(-1)!.content;

  it("nhiều token trong một frame chỉ ghi store MỘT lần", () => {
    const store = usePersonalAiStore.getState();
    let writes = 0;
    const unsub = usePersonalAiStore.subscribe(() => { writes += 1; });

    store.appendToken(convId, "Xin ");
    store.appendToken(convId, "chào ");
    store.appendToken(convId, "bạn");
    // Chưa sang frame → store chưa đổi.
    expect(contentOf()).toBe("");
    expect(writes).toBe(0);

    runFrame();
    expect(contentOf()).toBe("Xin chào bạn");
    expect(writes).toBe(1);
    unsub();
  });

  it("flush thủ công không mất token còn treo (bấm Dừng)", () => {
    const store = usePersonalAiStore.getState();
    store.appendToken(convId, "đang gõ dở");
    flushPersonalStreamBuffer();
    expect(contentOf()).toBe("đang gõ dở");
  });

  it("finalizeMessage xả buffer trước khi ghi đè — không nuốt mất chữ cuối", () => {
    const store = usePersonalAiStore.getState();
    store.appendToken(convId, "một phần");
    store.finalizeMessage(convId, "câu trả lời đầy đủ", undefined);
    // Frame cũ chạy SAU cũng không được nối thêm vào nội dung final.
    runFrame();
    expect(contentOf()).toBe("câu trả lời đầy đủ");
    expect(
      usePersonalAiStore
        .getState()
        .conversations.find((c) => c.id === convId)!
        .messages.at(-1)!.isStreaming,
    ).toBe(false);
  });

  it("đổi hội thoại giữa chừng → token cũ về ĐÚNG hội thoại của nó", () => {
    const store = usePersonalAiStore.getState();
    store.appendToken(convId, "của cuộc A");

    const otherId = usePersonalAiStore.getState().createConversation();
    usePersonalAiStore.getState().addMessage(otherId, assistantPlaceholder());
    usePersonalAiStore.getState().appendToken(otherId, "của cuộc B");
    runFrame();

    const convs = usePersonalAiStore.getState().conversations;
    expect(convs.find((c) => c.id === convId)!.messages.at(-1)!.content).toBe("của cuộc A");
    expect(convs.find((c) => c.id === otherId)!.messages.at(-1)!.content).toBe("của cuộc B");
  });
});
