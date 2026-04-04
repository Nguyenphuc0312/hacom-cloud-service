import { WebSocketEvents } from "../../../lib/socket";
import type {
  RealtimeEventHandler,
  RealtimeUnsubscribe,
  SocketLike,
} from "../types";

interface GroupEventHandlers {
  onGroupInviteNew?: RealtimeEventHandler;
  onGroupInviteUpdated?: RealtimeEventHandler;
  onGroupMemberJoined?: RealtimeEventHandler;
  onGroupMemberLeft?: RealtimeEventHandler;
  onGroupMemberUpdated?: RealtimeEventHandler;
  onGroupMemberBanned?: RealtimeEventHandler;
  onGroupSettingsUpdated?: RealtimeEventHandler;
  onGroupJoinRequestNew?: RealtimeEventHandler;
  onGroupJoinRequestResolved?: RealtimeEventHandler;
  onGroupPinUpdated?: RealtimeEventHandler;
  onGroupSlowModeTriggered?: RealtimeEventHandler;
  onPermissionChanged?: RealtimeEventHandler;
}

export const registerGroupEvents = (
  socket: SocketLike,
  handlers: GroupEventHandlers,
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

  register(WebSocketEvents.GROUP_INVITE_NEW, handlers.onGroupInviteNew);
  register(WebSocketEvents.GROUP_INVITE_UPDATED, handlers.onGroupInviteUpdated);
  register(WebSocketEvents.GROUP_MEMBER_JOINED, handlers.onGroupMemberJoined);
  register(WebSocketEvents.GROUP_MEMBER_LEFT, handlers.onGroupMemberLeft);
  register(WebSocketEvents.GROUP_MEMBER_UPDATED, handlers.onGroupMemberUpdated);
  register(WebSocketEvents.GROUP_MEMBER_BANNED, handlers.onGroupMemberBanned);
  register(
    WebSocketEvents.GROUP_SETTINGS_UPDATED,
    handlers.onGroupSettingsUpdated,
  );
  register(
    WebSocketEvents.GROUP_JOIN_REQUEST_NEW,
    handlers.onGroupJoinRequestNew,
  );
  register(
    WebSocketEvents.GROUP_JOIN_REQUEST_RESOLVED,
    handlers.onGroupJoinRequestResolved,
  );
  register(WebSocketEvents.GROUP_PIN_UPDATED, handlers.onGroupPinUpdated);
  register(
    WebSocketEvents.GROUP_SLOW_MODE_TRIGGERED,
    handlers.onGroupSlowModeTriggered,
  );
  register(WebSocketEvents.PERMISSION_CHANGED, handlers.onPermissionChanged);

  return () => {
    cleanups.forEach((cleanup) => cleanup());
  };
};
