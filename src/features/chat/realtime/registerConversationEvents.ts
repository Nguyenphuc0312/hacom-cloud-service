import { WebSocketEvents } from "../../../lib/socket";
import type {
  RealtimeEventHandler,
  RealtimeUnsubscribe,
  SocketLike,
} from "../types";

interface ConversationEventHandlers {
  onRoomJoined?: RealtimeEventHandler;
  onConversationJoined?: RealtimeEventHandler;
  onRoomLeft?: RealtimeEventHandler;
  onConversationLeft?: RealtimeEventHandler;
  onMessageRead?: RealtimeEventHandler;
  onMemberUpdated?: RealtimeEventHandler;
  onConversationDeleted?: RealtimeEventHandler;
}

export const registerConversationEvents = (
  socket: SocketLike,
  handlers: ConversationEventHandlers,
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

  register(WebSocketEvents.ROOM_JOINED, handlers.onRoomJoined);
  register(WebSocketEvents.CONVERSATION_JOINED, handlers.onConversationJoined);
  register(WebSocketEvents.ROOM_LEFT, handlers.onRoomLeft);
  register(WebSocketEvents.CONVERSATION_LEFT, handlers.onConversationLeft);
  register(WebSocketEvents.MESSAGE_READ, handlers.onMessageRead);
  register(WebSocketEvents.MEMBER_UPDATED, handlers.onMemberUpdated);
  register(
    WebSocketEvents.CONVERSATION_DELETED,
    handlers.onConversationDeleted,
  );

  return () => {
    cleanups.forEach((cleanup) => cleanup());
  };
};
