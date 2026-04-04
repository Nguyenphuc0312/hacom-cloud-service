import { WebSocketEvents } from "../../../lib/socket";
import type {
  RealtimeEventHandler,
  RealtimeUnsubscribe,
  SocketLike,
} from "../types";

interface SyncEventHandlers {
  onSyncComplete?: RealtimeEventHandler;
  onUserSettingsUpdated?: RealtimeEventHandler;
}

export const registerSyncEvents = (
  socket: SocketLike,
  handlers: SyncEventHandlers,
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

  register(WebSocketEvents.SYNC_COMPLETE, handlers.onSyncComplete);
  register(
    WebSocketEvents.USER_SETTINGS_UPDATED,
    handlers.onUserSettingsUpdated,
  );

  return () => {
    cleanups.forEach((cleanup) => cleanup());
  };
};
