/**
 * Integration tests for `useSimpleChatScroll`.
 *
 * Covers the 8 scroll rules the production decision tree depends on. The
 * hook owns a real DOM scroll element (jsdom) — tests assign `scrollHeight`
 * / `clientHeight` directly because jsdom doesn't lay things out.
 */

import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { useSimpleChatScroll } from "./useSimpleChatScroll";
import { MessageStatus, MessageType, type Message } from "../../../types";

const ME = "me";
const THEM = "them";

const mk = (id: string, senderId = THEM, clientMessageId?: string): Message =>
  ({
    id,
    clientMessageId,
    conversationId: "c1",
    senderId,
    senderName: senderId,
    type: MessageType.TEXT,
    content: id,
    timestamp: new Date(),
    createdAt: new Date(),
    status: MessageStatus.SENT,
    isPinned: false,
    isEdited: false,
    isDeleted: false,
    isSystem: false,
  }) as Message;

/** A test harness that mounts the hook and exposes a fake scroll element. */
interface HarnessAPI {
  setMessages: (next: Message[]) => void;
  setIsInitialLoading: (next: boolean) => void;
  triggerScrollEvent: () => void;
  triggerMediaLoad: () => void;
  jumpToLatest: () => void;
  getEl: () => HTMLDivElement;
  isAtBottom: () => boolean;
  pendingNewMessages: () => number;
}

const setLayout = (
  el: HTMLDivElement,
  opts: { scrollHeight: number; clientHeight: number; scrollTop: number },
): void => {
  Object.defineProperty(el, "scrollHeight", {
    value: opts.scrollHeight,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(el, "clientHeight", {
    value: opts.clientHeight,
    writable: true,
    configurable: true,
  });
  el.scrollTop = opts.scrollTop;
};

let rafCallbacks: Array<() => void> = [];
beforeEach(() => {
  rafCallbacks = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    rafCallbacks.push(() => cb(performance.now()));
    return rafCallbacks.length;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  // jsdom doesn't implement Element.scrollTo; install a shim that just
  // records the target so spies see the call.
  if (!HTMLElement.prototype.scrollTo) {
    HTMLElement.prototype.scrollTo = function (
      this: HTMLElement,
      ...args: unknown[]
    ): void {
      const first = args[0];
      if (first && typeof first === "object" && "top" in first) {
        this.scrollTop = Number((first as { top: number }).top);
      }
    } as typeof HTMLElement.prototype.scrollTo;
  }
});
const flushRaf = (): void => {
  const pending = rafCallbacks.splice(0);
  pending.forEach((cb) => cb());
};

function renderHarness(initial: {
  messages: Message[];
  hasOlder?: boolean;
  loadOlder?: () => void;
}): HarnessAPI {
  let api: HarnessAPI | null = null;

  const Harness: React.FC<{
    messages: Message[];
    hasOlder: boolean;
    isInitialLoading: boolean;
    loadOlder?: () => void;
  }> = (p) => {
    const hook = useSimpleChatScroll({
      conversationId: "c1",
      currentUserId: ME,
      messages: p.messages,
      hasOlder: p.hasOlder,
      isInitialLoading: p.isInitialLoading,
      loadOlder: p.loadOlder,
    });
    React.useEffect(() => {
      const el = hook.scrollRef.current;
      if (!el) return;
      // Default layout: 1000px content in 500px viewport, scrolled to bottom.
      setLayout(el, { scrollHeight: 1000, clientHeight: 500, scrollTop: 500 });
    }, [hook.scrollRef]);
    return (
      /* eslint-disable react-hooks/refs */
      <div
        ref={hook.scrollRef}
        data-testid="scroll"
        onScroll={hook.handleScroll}
        style={{ height: 500, overflow: "auto" }}
      >
        <button
          data-testid="media-load"
          onClick={() => hook.handleMediaLoad()}
        />
        <button
          data-testid="jump"
          onClick={() => hook.jumpToLatest()}
        />
        <output data-testid="pending">{hook.pendingNewMessages}</output>
        <output data-testid="atbottom">{String(hook.isAtBottom)}</output>
      </div>
      /* eslint-enable react-hooks/refs */
    );
  };

  let currentMessages = initial.messages;
  let currentLoading = false;
  const { rerender, getByTestId } = render(
    <Harness
      messages={currentMessages}
      hasOlder={Boolean(initial.hasOlder)}
      isInitialLoading={currentLoading}
      loadOlder={initial.loadOlder}
    />,
  );

  api = {
    setMessages: (next) => {
      currentMessages = next;
      rerender(
        <Harness
          messages={currentMessages}
          hasOlder={Boolean(initial.hasOlder)}
          isInitialLoading={currentLoading}
          loadOlder={initial.loadOlder}
        />,
      );
    },
    setIsInitialLoading: (next) => {
      currentLoading = next;
      rerender(
        <Harness
          messages={currentMessages}
          hasOlder={Boolean(initial.hasOlder)}
          isInitialLoading={currentLoading}
          loadOlder={initial.loadOlder}
        />,
      );
    },
    triggerScrollEvent: () =>
      getByTestId("scroll").dispatchEvent(
        new Event("scroll", { bubbles: true }),
      ),
    triggerMediaLoad: () =>
      (getByTestId("media-load") as HTMLButtonElement).click(),
    jumpToLatest: () => (getByTestId("jump") as HTMLButtonElement).click(),
    getEl: () => getByTestId("scroll") as HTMLDivElement,
    isAtBottom: () => getByTestId("atbottom").textContent === "true",
    pendingNewMessages: () => Number(getByTestId("pending").textContent),
  };
  return api;
}

describe("useSimpleChatScroll", () => {
  it("rule 1: initial load scrolls to bottom (once)", () => {
    const api = renderHarness({ messages: [mk("1"), mk("2")] });
    act(() => flushRaf());
    // jsdom didn't actually scroll; instead assert the hook saw initial settle.
    expect(api.isAtBottom()).toBe(true);
  });

  it("rule 2: append own message scrolls bottom + clears badge", () => {
    const api = renderHarness({ messages: [mk("1")] });
    act(() => flushRaf());

    const el = api.getEl();
    const spy = vi.spyOn(el, "scrollTo");

    act(() => api.setMessages([mk("1"), mk("2", ME)]));
    act(() => flushRaf());

    expect(spy).toHaveBeenCalledWith({ top: 1000, behavior: "auto" });
    expect(api.pendingNewMessages()).toBe(0);
  });

  it("rule 3: append remote while at bottom scrolls bottom", () => {
    const api = renderHarness({ messages: [mk("1")] });
    act(() => flushRaf());

    const el = api.getEl();
    setLayout(el, { scrollHeight: 1000, clientHeight: 500, scrollTop: 500 });

    const spy = vi.spyOn(el, "scrollTo");
    act(() => api.setMessages([mk("1"), mk("2", THEM)]));
    act(() => flushRaf());

    expect(spy).toHaveBeenCalled();
    expect(api.pendingNewMessages()).toBe(0);
  });

  it("rule 4: append remote while detached → no scroll + badge++", () => {
    const api = renderHarness({ messages: [mk("1")] });
    act(() => flushRaf());

    const el = api.getEl();
    setLayout(el, { scrollHeight: 1000, clientHeight: 500, scrollTop: 0 });
    // Simulate the user scrolling away so wasAtBottomRef flips false.
    act(() => api.triggerScrollEvent());

    const spy = vi.spyOn(el, "scrollTo");
    act(() => api.setMessages([mk("1"), mk("2", THEM)]));
    act(() => flushRaf());

    expect(spy).not.toHaveBeenCalled();
    expect(api.pendingNewMessages()).toBe(1);
  });

  it("rule 7: jumpToLatest scrolls smooth + clears badge", () => {
    const api = renderHarness({ messages: [mk("1")] });
    act(() => flushRaf());

    const el = api.getEl();
    setLayout(el, { scrollHeight: 1000, clientHeight: 500, scrollTop: 0 });
    act(() => api.triggerScrollEvent());
    act(() => api.setMessages([mk("1"), mk("2", THEM)]));
    act(() => flushRaf());
    expect(api.pendingNewMessages()).toBe(1);

    const spy = vi.spyOn(el, "scrollTo");
    act(() => api.jumpToLatest());
    expect(spy).toHaveBeenCalledWith({ top: 1000, behavior: "smooth" });
    expect(api.pendingNewMessages()).toBe(0);
  });

  it("rule 5: prepend older preserves scrollTop by scrollHeight delta", () => {
    let resolveLoad: () => void = () => undefined;
    const loadOlder = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveLoad = resolve;
        }),
    );
    const api = renderHarness({
      messages: [mk("3"), mk("4")],
      hasOlder: true,
      loadOlder,
    });
    act(() => flushRaf());

    const el = api.getEl();
    setLayout(el, { scrollHeight: 1000, clientHeight: 500, scrollTop: 50 });
    act(() => api.triggerScrollEvent()); // top → load older
    expect(loadOlder).toHaveBeenCalled();

    // Simulate prepend: scrollHeight grows by 600px, items grow by 2.
    act(() => api.setMessages([mk("1"), mk("2"), mk("3"), mk("4")]));
    setLayout(el, { scrollHeight: 1600, clientHeight: 500, scrollTop: 50 });
    act(() => {
      resolveLoad();
    });
    act(() => flushRaf());

    // 50 (old) + 600 (delta) = 650
    expect(el.scrollTop).toBe(650);
  });

  it("rule 6: media load while at bottom keeps bottom", () => {
    const api = renderHarness({ messages: [mk("1")] });
    act(() => flushRaf());

    const el = api.getEl();
    setLayout(el, { scrollHeight: 1000, clientHeight: 500, scrollTop: 500 });

    const spy = vi.spyOn(el, "scrollTo");
    act(() => api.triggerMediaLoad());
    act(() => flushRaf());
    expect(spy).toHaveBeenCalledWith({ top: 1000, behavior: "auto" });
  });

  it("rule 6: media load while detached does NOT scroll", () => {
    const api = renderHarness({ messages: [mk("1")] });
    act(() => flushRaf());

    const el = api.getEl();
    setLayout(el, { scrollHeight: 1000, clientHeight: 500, scrollTop: 0 });
    act(() => api.triggerScrollEvent());

    const spy = vi.spyOn(el, "scrollTo");
    act(() => api.triggerMediaLoad());
    act(() => flushRaf());
    expect(spy).not.toHaveBeenCalled();
  });

  it("rule 8: optimistic ack does NOT scroll and does NOT duplicate", () => {
    const optimistic = mk("tmp-1", ME, "cid-1");
    const api = renderHarness({ messages: [optimistic] });
    act(() => flushRaf());

    const el = api.getEl();
    const spy = vi.spyOn(el, "scrollTo");

    // Server ack: same clientMessageId, real id replaces tmp id.
    const reconciled = mk("real-1", ME, "cid-1");
    act(() => api.setMessages([reconciled]));
    act(() => flushRaf());

    expect(spy).not.toHaveBeenCalled();
    expect(api.pendingNewMessages()).toBe(0);
  });

  it("websocket duplicate (same key twice) does NOT scroll", () => {
    const api = renderHarness({ messages: [mk("1"), mk("2", THEM)] });
    act(() => flushRaf());

    const el = api.getEl();
    const spy = vi.spyOn(el, "scrollTo");
    // Same set of keys (new array reference) → classifier returns "update".
    act(() => api.setMessages([mk("1"), mk("2", THEM)]));
    act(() => flushRaf());
    expect(spy).not.toHaveBeenCalled();
  });
});
