import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePresence } from "./usePresence";

const socketMock = vi.hoisted(() => ({
  send: vi.fn(),
  on: vi.fn(),
  isConnected: vi.fn(),
}));

vi.mock("../lib/socket", () => ({
  initSocket: () => socketMock,
}));

describe("usePresence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    socketMock.send.mockReturnValue(true);
    socketMock.on.mockReturnValue(vi.fn());
    socketMock.isConnected.mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("subscribes by canonical conversationId for the websocket gateway", () => {
    const { unmount } = renderHook(() =>
      usePresence({ conversationId: "conversation-1" }),
    );

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(socketMock.send).toHaveBeenCalledWith("presence:subscribe", {
      conversationId: "conversation-1",
    });

    unmount();

    expect(socketMock.send).toHaveBeenCalledWith("presence:unsubscribe", {
      conversationId: "conversation-1",
    });
  });
});
