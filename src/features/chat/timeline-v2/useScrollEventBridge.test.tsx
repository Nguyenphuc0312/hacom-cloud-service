import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useScrollEventBridge } from "./useScrollEventBridge";
import { createDomScrollAdapter } from "./domScrollAdapter";

const mkElement = (init: { scrollHeight: number; clientHeight: number }) => {
  const el = document.createElement("div");
  Object.defineProperty(el, "scrollHeight", {
    value: init.scrollHeight,
    writable: true,
  });
  Object.defineProperty(el, "clientHeight", {
    value: init.clientHeight,
    writable: true,
  });
  el.scrollTop = 0;
  Object.defineProperty(el, "scrollTo", {
    value: vi.fn((opts?: ScrollToOptions | number) => {
      if (typeof opts === "object" && opts && typeof opts.top === "number") {
        el.scrollTop = opts.top;
      }
    }),
    writable: true,
    configurable: true,
  });
  document.body.appendChild(el);
  return el;
};

const flushRaf = async () => {
  await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
};

describe("useScrollEventBridge", () => {
  it("dispatches USER_SCROLL with correct distanceToBottom on user scroll", async () => {
    const el = mkElement({ scrollHeight: 1000, clientHeight: 400 });
    const adapter = createDomScrollAdapter(() => el);
    const dispatch = vi.fn();

    renderHook(() =>
      useScrollEventBridge({
        getOuterElement: () => el,
        adapter,
        dispatch,
        active: true,
      }),
    );

    // Simulate user scroll: scrollTop = 200, distanceToBottom = 1000 - 400 - 200 = 400
    el.scrollTop = 200;
    el.dispatchEvent(new Event("scroll"));
    await act(async () => {
      await flushRaf();
    });

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "USER_SCROLL",
        distanceToBottom: 400,
      }),
    );
  });

  it("does NOT dispatch USER_SCROLL while a programmatic scroll is in flight", async () => {
    const el = mkElement({ scrollHeight: 1000, clientHeight: 400 });
    const adapter = createDomScrollAdapter(() => el);
    const dispatch = vi.fn();

    renderHook(() =>
      useScrollEventBridge({
        getOuterElement: () => el,
        adapter,
        dispatch,
        active: true,
      }),
    );

    // Issue a programmatic scroll → adapter marks the flag.
    adapter.scrollToOffset(500, "smooth");
    el.scrollTop = 500;
    el.dispatchEvent(new Event("scroll"));
    await act(async () => {
      await flushRaf();
    });

    // Reached bottom? distanceToBottom = 1000 - 400 - 500 = 100 → not bottom.
    // We expect NO USER_SCROLL dispatch (programmatic frame swallowed).
    const userScrollCalls = dispatch.mock.calls.filter(
      ([e]) => (e as { type: string }).type === "USER_SCROLL",
    );
    expect(userScrollCalls).toHaveLength(0);
  });

  it("emits BOTTOM_REACHED when programmatic scroll lands at bottom", async () => {
    const el = mkElement({ scrollHeight: 1000, clientHeight: 400 });
    const adapter = createDomScrollAdapter(() => el);
    const dispatch = vi.fn();

    renderHook(() =>
      useScrollEventBridge({
        getOuterElement: () => el,
        adapter,
        dispatch,
        active: true,
      }),
    );

    adapter.scrollToBottom("instant");
    el.scrollTop = 600; // 1000 - 400 = 600 → distanceToBottom = 0
    el.dispatchEvent(new Event("scroll"));
    await act(async () => {
      await flushRaf();
    });

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "BOTTOM_REACHED" }),
    );
  });

  it("observe-only (active=false) suppresses dispatch but still logs", async () => {
    const el = mkElement({ scrollHeight: 1000, clientHeight: 400 });
    const adapter = createDomScrollAdapter(() => el);
    const dispatch = vi.fn();

    renderHook(() =>
      useScrollEventBridge({
        getOuterElement: () => el,
        adapter,
        dispatch,
        active: false,
      }),
    );

    el.scrollTop = 50;
    el.dispatchEvent(new Event("scroll"));
    await act(async () => {
      await flushRaf();
    });

    expect(dispatch).not.toHaveBeenCalled();
  });

  it("coalesces multiple scroll events fired in the same frame", async () => {
    const el = mkElement({ scrollHeight: 1000, clientHeight: 400 });
    const adapter = createDomScrollAdapter(() => el);
    const dispatch = vi.fn();

    renderHook(() =>
      useScrollEventBridge({
        getOuterElement: () => el,
        adapter,
        dispatch,
        active: true,
      }),
    );

    el.scrollTop = 50;
    el.dispatchEvent(new Event("scroll"));
    el.scrollTop = 60;
    el.dispatchEvent(new Event("scroll"));
    el.scrollTop = 70;
    el.dispatchEvent(new Event("scroll"));
    await act(async () => {
      await flushRaf();
    });

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "USER_SCROLL",
        // Final scrollTop wins.
        distanceToBottom: 530,
      }),
    );
  });
});
