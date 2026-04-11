import { describe, expect, it, vi } from "vitest";
import { registerSyncEvents } from "./registerSyncEvents";

interface RegisteredHandler {
  eventName: string;
  handler: (payload: unknown) => void;
}

describe("registerSyncEvents", () => {
  it("registers canonical recovery events and never depends on sync:complete", () => {
    const registered: RegisteredHandler[] = [];

    const socket = {
      on: (eventName: string, handler: (payload: unknown) => void) => {
        registered.push({ eventName, handler });
      },
      off: vi.fn(),
    };

    const noop = vi.fn();

    const unsubscribe = registerSyncEvents(socket, {
      onConversationResynced: noop,
      onResyncRequired: noop,
      onUserSettingsUpdated: noop,
    });

    expect(registered.map((row) => row.eventName)).toEqual(
      expect.arrayContaining([
        "conversation:resynced",
        "resync:required",
        "user:settings_updated",
      ]),
    );
    expect(registered.map((row) => row.eventName)).not.toContain(
      "sync:complete",
    );

    unsubscribe();

    expect(socket.off).toHaveBeenCalledTimes(3);
  });
});
