import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTypingIndicator } from "./useTypingIndicator";

describe("useTypingIndicator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-26T10:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces start, sends heartbeat, and sends stopped after idle", () => {
    const onTyping = vi.fn();
    const { result } = renderHook(() =>
      useTypingIndicator({
        onTyping,
        startDelayMs: 10,
        stopDelayMs: 50,
        heartbeatIntervalMs: 30,
      }),
    );

    act(() => {
      result.current.notifyInput({ hasText: true, isFocused: true });
    });
    expect(onTyping).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(10);
    });
    expect(onTyping).toHaveBeenCalledTimes(1);
    expect(onTyping).toHaveBeenLastCalledWith(true);

    act(() => {
      vi.advanceTimersByTime(20);
      result.current.notifyInput({ hasText: true, isFocused: true });
    });
    expect(onTyping).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(10);
      result.current.notifyInput({ hasText: true, isFocused: true });
    });
    expect(onTyping).toHaveBeenCalledTimes(2);
    expect(onTyping).toHaveBeenLastCalledWith(true);

    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(onTyping).toHaveBeenCalledTimes(3);
    expect(onTyping).toHaveBeenLastCalledWith(false);
  });

  it("sends stopped on empty input, blur, tab hidden, and unmount", () => {
    const onTyping = vi.fn();
    const { result, unmount } = renderHook(() =>
      useTypingIndicator({
        onTyping,
        startDelayMs: 0,
        stopDelayMs: 1000,
      }),
    );

    act(() => {
      result.current.notifyInput({ hasText: true, isFocused: true });
      vi.advanceTimersByTime(0);
    });
    expect(onTyping).toHaveBeenLastCalledWith(true);

    act(() => {
      result.current.notifyInput({ hasText: false, isFocused: true });
    });
    expect(onTyping).toHaveBeenLastCalledWith(false);

    act(() => {
      result.current.notifyInput({ hasText: true, isFocused: true });
      vi.advanceTimersByTime(0);
      result.current.notifyBlur();
    });
    expect(onTyping).toHaveBeenLastCalledWith(false);

    act(() => {
      result.current.notifyInput({ hasText: true, isFocused: true });
      vi.advanceTimersByTime(0);
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(onTyping).toHaveBeenLastCalledWith(false);

    act(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "visible",
      });
      result.current.notifyInput({ hasText: true, isFocused: true });
      vi.advanceTimersByTime(0);
    });
    expect(onTyping).toHaveBeenLastCalledWith(true);

    unmount();
    expect(onTyping).toHaveBeenLastCalledWith(false);
  });
});
