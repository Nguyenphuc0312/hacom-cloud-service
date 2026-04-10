import { describe, expect, it, vi } from "vitest";
import { registerPresenceEvents } from "./registerPresenceEvents";

interface RegisteredHandler {
  eventName: string;
  handler: (payload: unknown) => void;
}

describe("registerPresenceEvents", () => {
  it("registers only canonical presence and typing events", () => {
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
        "presence:update",
      ]),
    );
    expect(registered.map((row) => row.eventName)).not.toContain(
      "presence:updated",
    );

    unsubscribe();

    expect(socket.off).toHaveBeenCalledTimes(3);
  });
});
