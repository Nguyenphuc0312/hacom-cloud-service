import { WebSocketEvents } from "../../../lib/socket";
import type {
  RealtimeEventHandler,
  RealtimeUnsubscribe,
  SocketLike,
} from "../types";

interface ConnectionEventHandlers {
  onConnect?: RealtimeEventHandler;
  onDisconnect?: RealtimeEventHandler;
  onConnectError?: RealtimeEventHandler;
  onWsError?: RealtimeEventHandler;
  onAuthUnauthorized?: RealtimeEventHandler;
  onAuthReauthRequired?: RealtimeEventHandler;
}

export const registerConnectionEvents = (
  socket: SocketLike,
  handlers: ConnectionEventHandlers,
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

  register("connect", handlers.onConnect);
  register("disconnect", handlers.onDisconnect);
  register("connect_error", handlers.onConnectError);
  register(WebSocketEvents.ERROR, handlers.onWsError);
  register(WebSocketEvents.AUTH_UNAUTHORIZED, handlers.onAuthUnauthorized);
  register(WebSocketEvents.AUTH_REAUTH_REQUIRED, handlers.onAuthReauthRequired);

  return () => {
    cleanups.forEach((cleanup) => cleanup());
  };
};
