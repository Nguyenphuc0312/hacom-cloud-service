import type { RealtimeUnsubscribe, SocketLike } from "../types";

interface PresenceEventHandlers {
  onTypingStart?: (payload: unknown) => void;
  onTypingStop?: (payload: unknown) => void;
  onPresenceChanged?: (payload: unknown) => void;
}

export const registerPresenceEvents = (
  socket: SocketLike,
  handlers: PresenceEventHandlers,
): RealtimeUnsubscribe => {
  if (handlers.onTypingStart) {
    socket.on("typing.start", handlers.onTypingStart);
  }
  if (handlers.onTypingStop) {
    socket.on("typing.stop", handlers.onTypingStop);
  }
  if (handlers.onPresenceChanged) {
    socket.on("presence.changed", handlers.onPresenceChanged);
  }

  return () => {
    if (handlers.onTypingStart) {
      socket.off("typing.start", handlers.onTypingStart);
    }
    if (handlers.onTypingStop) {
      socket.off("typing.stop", handlers.onTypingStop);
    }
    if (handlers.onPresenceChanged) {
      socket.off("presence.changed", handlers.onPresenceChanged);
    }
  };
};
