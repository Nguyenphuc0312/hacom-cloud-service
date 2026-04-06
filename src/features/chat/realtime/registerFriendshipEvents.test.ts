import { describe, expect, it, vi } from "vitest";
import { registerFriendshipEvents } from "./registerFriendshipEvents";

interface RegisteredHandler {
  eventName: string;
  handler: (payload: unknown) => void;
}

describe("registerFriendshipEvents", () => {
  it("registers both canonical and legacy friendship events", () => {
    const registered: RegisteredHandler[] = [];

    const socket = {
      on: (eventName: string, handler: (payload: unknown) => void) => {
        registered.push({ eventName, handler });
      },
      off: vi.fn(),
    };

    const noop = vi.fn();

    const unsubscribe = registerFriendshipEvents(socket, {
      onFriendshipRequestCreated: noop,
      onFriendshipRequestUpdated: noop,
      onFriendshipRelationUpdated: noop,
    });

    expect(registered.map((row) => row.eventName)).toEqual(
      expect.arrayContaining([
        "friendship:request:created",
        "friend:request:new",
        "friendship:request:updated",
        "friend:request:updated",
        "friendship:relation:updated",
        "friend:status:changed",
      ]),
    );

    unsubscribe();

    expect(socket.off).toHaveBeenCalledTimes(6);
  });
});
