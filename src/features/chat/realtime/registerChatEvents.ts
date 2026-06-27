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
  onMessageRecalled?: RealtimeEventHandler;
  onMessageDeletedGlobal?: RealtimeEventHandler;
  onMessageDeletedForMe?: RealtimeEventHandler;
  onMessageDelivered?: RealtimeEventHandler;
  onReactionAdded?: RealtimeEventHandler;
  onReactionRemoved?: RealtimeEventHandler;
  onReactionUpdated?: RealtimeEventHandler;
  onConversationParticipantUpdated?: RealtimeEventHandler;
  onAttachmentPreviewReady?: RealtimeEventHandler;
  onAttachmentPreviewFailed?: RealtimeEventHandler;
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
  register(WebSocketEvents.MESSAGE_CREATED, handlers.onMessageNew);
  register(WebSocketEvents.ROOM_MESSAGE_CREATED, handlers.onMessageNew);
  register(WebSocketEvents.NEW_MESSAGE, handlers.onMessageNew);
  register(WebSocketEvents.MESSAGE_UPDATED, handlers.onMessageUpdated);
  register(WebSocketEvents.MESSAGE_DELETED, handlers.onMessageDeleted);
  register(WebSocketEvents.MESSAGE_DELIVERED, handlers.onMessageDelivered);
  register("message:revoked", handlers.onMessageDeleted);
  register(
    WebSocketEvents.MESSAGE_RECALLED,
    handlers.onMessageRecalled ?? handlers.onMessageDeleted,
  );
  register(
    WebSocketEvents.MESSAGE_DELETED_GLOBAL,
    handlers.onMessageDeletedGlobal ?? handlers.onMessageDeleted,
  );
  register(
    WebSocketEvents.MESSAGE_DELETED_FOR_ME,
    handlers.onMessageDeletedForMe ?? handlers.onMessageDeleted,
  );
  register("reaction:added", handlers.onReactionAdded);
  register("message:reaction_added", handlers.onReactionAdded);
  register("reaction:removed", handlers.onReactionRemoved);
  register("message:reaction_removed", handlers.onReactionRemoved);
  register("REACTION_UPDATED", handlers.onReactionUpdated);
  register(
    WebSocketEvents.CONVERSATION_PARTICIPANT_UPDATED,
    handlers.onConversationParticipantUpdated,
  );
  register(
    WebSocketEvents.ATTACHMENT_PREVIEW_READY,
    handlers.onAttachmentPreviewReady,
  );
  register(
    WebSocketEvents.ATTACHMENT_PREVIEW_FAILED,
    handlers.onAttachmentPreviewFailed,
  );

  return () => {
    cleanups.forEach((cleanup) => cleanup());
  };
};
