import { describe, expect, it, vi } from "vitest";
import { registerChatEvents } from "./registerChatEvents";
import type { RealtimeEventHandler, SocketLike } from "../types";

class FakeSocket implements SocketLike {
  handlers = new Map<string, RealtimeEventHandler>();

  on(eventName: string, handler: RealtimeEventHandler) {
    this.handlers.set(eventName, handler);
    return () => this.handlers.delete(eventName);
  }

  off(eventName: string, handler: RealtimeEventHandler) {
    if (this.handlers.get(eventName) === handler) {
      this.handlers.delete(eventName);
    }
  }

  emit(eventName: string, payload: unknown) {
    this.handlers.get(eventName)?.(payload);
  }
}

describe("registerChatEvents", () => {
  it("routes canonical and legacy message-created aliases to onMessageNew", () => {
    const socket = new FakeSocket();
    const onMessageNew = vi.fn();

    registerChatEvents(socket, { onMessageNew });

    socket.emit("message:new", { message: { id: "msg-legacy" } });
    socket.emit("message.created", { message: { id: "msg-canonical" } });
    socket.emit("room.message.created", { message: { id: "msg-room" } });
    socket.emit("new_message", { message: { id: "msg-presence-legacy" } });

    expect(onMessageNew).toHaveBeenCalledTimes(4);
  });
});
