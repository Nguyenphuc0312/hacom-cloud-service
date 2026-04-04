import { WebSocketEvents } from "../../../lib/socket";
import type {
  RealtimeEventHandler,
  RealtimeUnsubscribe,
  SocketLike,
} from "../types";

interface FriendshipEventHandlers {
  onFriendRequestNew?: RealtimeEventHandler;
  onFriendRequestUpdated?: RealtimeEventHandler;
  onFriendStatusChanged?: RealtimeEventHandler;
}

export const registerFriendshipEvents = (
  socket: SocketLike,
  handlers: FriendshipEventHandlers,
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

  register(WebSocketEvents.FRIEND_REQUEST_NEW, handlers.onFriendRequestNew);
  register(
    WebSocketEvents.FRIEND_REQUEST_UPDATED,
    handlers.onFriendRequestUpdated,
  );
  register(
    WebSocketEvents.FRIEND_STATUS_CHANGED,
    handlers.onFriendStatusChanged,
  );

  return () => {
    cleanups.forEach((cleanup) => cleanup());
  };
};
