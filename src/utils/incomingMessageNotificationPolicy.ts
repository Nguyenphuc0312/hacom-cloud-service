/**
 * @fileoverview Pure decision logic for incoming-message notifications.
 *
 * Extracted from useWebSocket.maybeNotifyIncomingMessage so the guard
 * decisions can be unit-tested without mocking DOM Notification, stores,
 * or the WebSocket layer.
 */

export type IncomingMessageNotificationBailReason =
  | "self_message"
  | "notifications_disabled"
  | "muted";

export interface IncomingMessageNotificationContext {
  /** Sender of the incoming message (null when payload lacks a sender). */
  senderId: string | null;
  /** Currently authenticated user (null when logged out). */
  currentUserId: string | null;
  /** settings.notifications.enabled */
  notificationsEnabled: boolean;
  /**
   * Mute flag of the conversation in the local store. A conversation missing
   * from the store must be passed as `false` — never default to muted.
   */
  isMuted: boolean;
  /** True when the incoming message mentions the current user. */
  hasMention: boolean;
  /** True when the SPA route is the Messages module (/chat...). */
  isInMessageModule: boolean;
  /** Packaged desktop deliberately shows native toasts while focused. */
  forceDesktopNative?: boolean;
  /** document.visibilityState === "visible" && document.hasFocus() */
  visibleAndFocused: boolean;
}

export interface IncomingMessageNotificationDecision {
  /**
   * Emit an OS/browser `new Notification(...)`. Must be true whenever the
   * document is hidden or unfocused (e.g. desktop client minimized to tray),
   * regardless of which SPA module is mounted — the desktop thin-client stays
   * on /chat/... while hidden.
   */
  emitBrowserNotification: boolean;
  /** Show the in-app singleton toast (suppressed inside the Messages module). */
  showInAppToast: boolean;
  /** Persist to the in-app notification center store. */
  upsertNotificationStore: boolean;
  bailReason: IncomingMessageNotificationBailReason | null;
}

const BAIL: Omit<IncomingMessageNotificationDecision, "bailReason"> = {
  emitBrowserNotification: false,
  showInAppToast: false,
  upsertNotificationStore: false,
};

export const decideIncomingMessageNotification = (
  context: IncomingMessageNotificationContext,
): IncomingMessageNotificationDecision => {
  if (
    !context.currentUserId ||
    !context.senderId ||
    context.senderId === context.currentUserId
  ) {
    return { ...BAIL, bailReason: "self_message" };
  }

  if (!context.notificationsEnabled) {
    return { ...BAIL, bailReason: "notifications_disabled" };
  }

  if (context.isMuted && !context.hasMention) {
    return { ...BAIL, bailReason: "muted" };
  }

  return {
    emitBrowserNotification: Boolean(context.forceDesktopNative) || !context.visibleAndFocused,
    showInAppToast: !context.isInMessageModule,
    upsertNotificationStore: true,
    bailReason: null,
  };
};

/**
 * Server sends `mentions` as `Mention[]` objects (`{ userId, displayName, … }`
 * per chat-shared-types), while older payloads may carry plain user-id
 * strings. Normalize both shapes to a string[] of user ids.
 */
export const normalizeMentionUserIds = (mentions: unknown): string[] => {
  if (!Array.isArray(mentions)) {
    return [];
  }

  const userIds: string[] = [];
  for (const item of mentions) {
    if (typeof item === "string" && item.trim().length > 0) {
      userIds.push(item);
      continue;
    }
    if (item !== null && typeof item === "object") {
      const userId = (item as { userId?: unknown }).userId;
      if (typeof userId === "string" && userId.trim().length > 0) {
        userIds.push(userId);
      }
    }
  }
  return userIds;
};
