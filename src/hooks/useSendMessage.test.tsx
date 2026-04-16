import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useSendMessage } from "./useSendMessage";

describe("useSendMessage", () => {
  it("returns optimistic for async text sends so the composer does not announce sent before ack", async () => {
    const onSend = vi.fn().mockResolvedValue({
      disposition: "sent",
      messageId: "msg-1",
    });

    const { result } = renderHook(() =>
      useSendMessage({
        onSend,
      }),
    );

    await expect(result.current.sendTextMessage("hello")).resolves.toBe(
      "optimistic",
    );
    expect(onSend).toHaveBeenCalledWith("hello");
  });

  it("returns queued when the send path synchronously reports queueing", async () => {
    const onSend = vi.fn().mockReturnValue({
      disposition: "queued",
      messageId: "msg-2",
    });

    const { result } = renderHook(() =>
      useSendMessage({
        onSend,
      }),
    );

    await expect(result.current.sendTextMessage("hello")).resolves.toBe(
      "queued",
    );
  });
});
