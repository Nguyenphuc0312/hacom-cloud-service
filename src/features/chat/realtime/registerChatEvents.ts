import type { RealtimeUnsubscribe, SocketLike } from "../types";

interface ChatEventHandlers {
  onMessageCreated?: (payload: unknown) => void;
  onMessageUpdated?: (payload: unknown) => void;
  onMessageDeleted?: (payload: unknown) => void;
}

export const registerChatEvents = (
  socket: SocketLike,
  handlers: ChatEventHandlers,
): RealtimeUnsubscribe => {
  if (handlers.onMessageCreated) {
    socket.on("message.created", handlers.onMessageCreated);
  }
  if (handlers.onMessageUpdated) {
    socket.on("message.updated", handlers.onMessageUpdated);
  }
  if (handlers.onMessageDeleted) {
    socket.on("message.deleted", handlers.onMessageDeleted);
  }

  return () => {
    if (handlers.onMessageCreated) {
      socket.off("message.created", handlers.onMessageCreated);
    }
    if (handlers.onMessageUpdated) {
      socket.off("message.updated", handlers.onMessageUpdated);
    }
    if (handlers.onMessageDeleted) {
      socket.off("message.deleted", handlers.onMessageDeleted);
    }
  };
};
