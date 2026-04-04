import { WebSocketEvents } from "../../../lib/socket";
import type {
  RealtimeEventHandler,
  RealtimeUnsubscribe,
  SocketLike,
} from "../types";

interface PresenceEventHandlers {
  onTypingStart?: RealtimeEventHandler;
  onTypingStop?: RealtimeEventHandler;
  onPresenceChanged?: RealtimeEventHandler;
}

export const registerPresenceEvents = (
  socket: SocketLike,
  handlers: PresenceEventHandlers,
): RealtimeUnsubscribe => {
  const cleanups: RealtimeUnsubscribe[] = [];

  const register = (
    eventName: string,
    handler?: RealtimeEventHandler,
  ): void => {
    if (!handler) return;
    const maybeUnsubscribe = socket.on(eventName, handler);
    if (typeof maybeUnsubscribe === "function") {
      cleanups.push(maybeUnsubscribe);
      return;
    }
    if (typeof socket.off === "function") {
      cleanups.push(() => {
        socket.off?.(eventName, handler);
      });
    }
  };

  register(WebSocketEvents.TYPING_START, handlers.onTypingStart);
  register(WebSocketEvents.TYPING_STOP, handlers.onTypingStop);
  register("presence.changed", handlers.onPresenceChanged);

  return () => {
    cleanups.forEach((cleanup) => cleanup());
  };
};
