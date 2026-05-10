import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDomScrollAdapter } from "./domScrollAdapter";

const mkElement = (init: {
  scrollTop?: number;
  scrollHeight?: number;
  clientHeight?: number;
}): HTMLElement => {
  const el = document.createElement("div");
  Object.defineProperty(el, "scrollHeight", {
    value: init.scrollHeight ?? 1000,
    writable: true,
  });
  Object.defineProperty(el, "clientHeight", {
    value: init.clientHeight ?? 500,
    writable: true,
  });
  el.scrollTop = init.scrollTop ?? 0;
  // jsdom doesn't implement smooth-scroll; record the call instead.
  const scrollSpy = vi.fn((opts?: ScrollToOptions | number) => {
    if (typeof opts === "object" && opts && typeof opts.top === "number") {
      el.scrollTop = opts.top;
    }
  });
  Object.defineProperty(el, "scrollTo", {
    value: scrollSpy,
    writable: true,
    configurable: true,
  });
  return el;
};

describe("createDomScrollAdapter — read paths", () => {
  it("getScrollElement returns the getter's current value", () => {
    let current: HTMLElement | null = null;
    const adapter = createDomScrollAdapter(() => current);
    expect(adapter.getScrollElement()).toBeNull();
    current = mkElement({});
    expect(adapter.getScrollElement()).toBe(current);
  });

  it("getTotalSize falls back to scrollHeight when no override is provided", () => {
    const el = mkElement({ scrollHeight: 4321 });
    const adapter = createDomScrollAdapter(() => el);
    expect(adapter.getTotalSize()).toBe(4321);
  });

  it("getTotalSize uses resolveTotalSize override when provided", () => {
    const el = mkElement({ scrollHeight: 100 });
    const adapter = createDomScrollAdapter(() => el, {
      resolveTotalSize: () => 9999,
    });
    expect(adapter.getTotalSize()).toBe(9999);
  });

  it("getItemOffset is a no-op (returns 0) when resolver is missing", () => {
    const el = mkElement({});
    const adapter = createDomScrollAdapter(() => el);
    expect(adapter.getItemOffset(7)).toBe(0);
  });

  it("getItemOffset delegates to the resolver when provided", () => {
    const resolveItemOffset = vi.fn((i: number) => i * 50);
    const el = mkElement({});
    const adapter = createDomScrollAdapter(() => el, { resolveItemOffset });
    expect(adapter.getItemOffset(3)).toBe(150);
    expect(resolveItemOffset).toHaveBeenCalledWith(3);
  });
});

describe("createDomScrollAdapter — write paths", () => {
  it("scrollToOffset clamps to >= 0 and forwards behavior", () => {
    const el = mkElement({ scrollTop: 0 });
    const adapter = createDomScrollAdapter(() => el);
    adapter.scrollToOffset(-50, "instant");
    expect(el.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
    adapter.scrollToOffset(120, "smooth");
    expect(el.scrollTo).toHaveBeenLastCalledWith({ top: 120, behavior: "smooth" });
  });

  it("scrollToBottom targets scrollHeight - clientHeight", () => {
    const el = mkElement({ scrollHeight: 1000, clientHeight: 400 });
    const adapter = createDomScrollAdapter(() => el);
    adapter.scrollToBottom("instant");
    expect(el.scrollTo).toHaveBeenCalledWith({ top: 600, behavior: "auto" });
  });

  it("scrollToIndex aligns end correctly", () => {
    const el = mkElement({ scrollHeight: 1000, clientHeight: 400 });
    const adapter = createDomScrollAdapter(() => el, {
      resolveItemOffset: (i) => i * 100,
    });
    adapter.scrollToIndex(5, "end", "instant");
    // itemTop=500, viewport=400 → target = 500 - 400 = 100
    expect(el.scrollTo).toHaveBeenCalledWith({ top: 100, behavior: "auto" });
  });

  it("scrollToIndex with no resolver is a no-op", () => {
    const el = mkElement({});
    const adapter = createDomScrollAdapter(() => el);
    adapter.scrollToIndex(2, "start", "instant");
    expect(el.scrollTo).not.toHaveBeenCalled();
  });

  it("does nothing when getter returns null", () => {
    const adapter = createDomScrollAdapter(() => null);
    expect(() => adapter.scrollToOffset(50, "instant")).not.toThrow();
    expect(() => adapter.scrollToBottom("smooth")).not.toThrow();
    expect(() => adapter.scrollToIndex(0, "start", "instant")).not.toThrow();
  });
});

describe("createDomScrollAdapter — programmatic-scroll TTL", () => {
  let nowMs = 1000;
  const now = () => nowMs;
  beforeEach(() => {
    nowMs = 1000;
  });

  it("flags scroll events near the target as programmatic", () => {
    const el = mkElement({ scrollTop: 0 });
    const adapter = createDomScrollAdapter(() => el, { now });
    adapter.scrollToOffset(500, "smooth");
    expect(adapter.isProgrammaticScroll(495)).toBe(true);
    // Reaching the exact target clears the flag (next user scroll is real).
    adapter.scrollToOffset(500, "smooth");
    expect(adapter.isProgrammaticScroll(500)).toBe(true);
    expect(adapter.isProgrammaticScroll(500)).toBe(false);
  });

  it("classifies en-route smooth-scroll frames as programmatic until TTL", () => {
    const el = mkElement({ scrollTop: 0 });
    const adapter = createDomScrollAdapter(() => el, { now });
    adapter.scrollToOffset(2000, "smooth");
    // Mid-flight: 1000 px from target, well within TTL → still programmatic.
    expect(adapter.isProgrammaticScroll(1000)).toBe(true);
  });

  it("expires after TTL based on distance", () => {
    const el = mkElement({ scrollTop: 0 });
    const adapter = createDomScrollAdapter(() => el, { now });
    adapter.scrollToOffset(2000, "smooth");
    // TTL = clamp(320 + 2000/3, 320, 1200) ≈ 986ms
    nowMs = 1000 + 1500;
    expect(adapter.isProgrammaticScroll(1000)).toBe(false);
  });

  it("clearProgrammaticFlag forces user-scroll classification", () => {
    const el = mkElement({ scrollTop: 0 });
    const adapter = createDomScrollAdapter(() => el, { now });
    adapter.scrollToOffset(500, "smooth");
    adapter.clearProgrammaticFlag();
    expect(adapter.isProgrammaticScroll(500)).toBe(false);
  });
});
