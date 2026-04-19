import { WebSocketEvents } from "../../../lib/socket";
import type {
  RealtimeEventHandler,
  RealtimeUnsubscribe,
  SocketLike,
} from "../types";

interface ConversationEventHandlers {
  onConversationJoined?: RealtimeEventHandler;
  onConversationLeft?: RealtimeEventHandler;
  onConversationSummaryUpdated?: RealtimeEventHandler;
  onConversationMembershipUpdated?: RealtimeEventHandler;
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

  register(WebSocketEvents.CONVERSATION_JOINED, handlers.onConversationJoined);
  register(WebSocketEvents.ROOM_JOINED, handlers.onConversationJoined);
  register(WebSocketEvents.CONVERSATION_LEFT, handlers.onConversationLeft);
  register(WebSocketEvents.ROOM_LEFT, handlers.onConversationLeft);
  register(
    WebSocketEvents.CONVERSATION_SUMMARY_UPDATED,
    handlers.onConversationSummaryUpdated,
  );
  register(
    WebSocketEvents.CONVERSATION_MEMBERSHIP_UPDATED,
    handlers.onConversationMembershipUpdated,
  );
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
