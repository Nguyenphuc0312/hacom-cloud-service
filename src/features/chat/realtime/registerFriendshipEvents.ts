import { WebSocketEvents } from "../../../lib/socket";
import type {
  RealtimeEventHandler,
  RealtimeUnsubscribe,
  SocketLike,
} from "../types";

interface FriendshipEventHandlers {
  onFriendshipRequestCreated?: RealtimeEventHandler;
  onFriendshipRequestUpdated?: RealtimeEventHandler;
  onFriendshipRelationUpdated?: RealtimeEventHandler;
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

  register(
    WebSocketEvents.FRIENDSHIP_REQUEST_CREATED,
    handlers.onFriendshipRequestCreated,
  );
  register(
    WebSocketEvents.FRIEND_REQUEST_NEW,
    handlers.onFriendshipRequestCreated,
  );

  register(
    WebSocketEvents.FRIENDSHIP_REQUEST_UPDATED,
    handlers.onFriendshipRequestUpdated,
  );
  register(
    WebSocketEvents.FRIEND_REQUEST_UPDATED,
    handlers.onFriendshipRequestUpdated,
  );

  register(
    WebSocketEvents.FRIENDSHIP_RELATION_UPDATED,
    handlers.onFriendshipRelationUpdated,
  );
  register(
    WebSocketEvents.FRIEND_STATUS_CHANGED,
    handlers.onFriendshipRelationUpdated,
  );

  return () => {
    cleanups.forEach((cleanup) => cleanup());
  };
};
