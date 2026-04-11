import { WebSocketEvents } from "../../../lib/socket";
import type {
  RealtimeEventHandler,
  RealtimeUnsubscribe,
  SocketLike,
} from "../types";

interface ChatEventHandlers {
  onMessageNew?: RealtimeEventHandler;
  onMessageUpdated?: RealtimeEventHandler;
  onMessageDeleted?: RealtimeEventHandler;
}

export const registerChatEvents = (
  socket: SocketLike,
  handlers: ChatEventHandlers,
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

  register(WebSocketEvents.MESSAGE_NEW, handlers.onMessageNew);
  register(WebSocketEvents.MESSAGE_UPDATED, handlers.onMessageUpdated);
  register(WebSocketEvents.MESSAGE_DELETED, handlers.onMessageDeleted);

  return () => {
    cleanups.forEach((cleanup) => cleanup());
  };
};
