import { describe, expect, it, vi } from "vitest";
import { registerPresenceEvents } from "./registerPresenceEvents";

interface RegisteredHandler {
  eventName: string;
  handler: (payload: unknown) => void;
}

describe("registerPresenceEvents", () => {
  it("registers canonical and legacy typing events", () => {
    const registered: RegisteredHandler[] = [];

    const socket = {
      on: (eventName: string, handler: (payload: unknown) => void) => {
        registered.push({ eventName, handler });
      },
      off: vi.fn(),
    };

    const noop = vi.fn();

    const unsubscribe = registerPresenceEvents(socket, {
      onTypingStart: noop,
      onTypingStop: noop,
      onPresenceChanged: noop,
    });

    expect(registered.map((row) => row.eventName)).toEqual(
      expect.arrayContaining([
        "typing:start",
        "typing:stop",
        "conversation.typing.started",
        "conversation.typing.stopped",
        "presence:update",
      ]),
    );
    expect(registered.map((row) => row.eventName)).not.toContain(
      "presence:updated",
    );

    unsubscribe();

    expect(socket.off).toHaveBeenCalledTimes(5);
  });
});
