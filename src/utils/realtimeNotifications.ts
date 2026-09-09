import { notifyDebug } from "./logger";
import { useSettingsStore } from "../settings/settingsStore";

type NavigatorBadgeApi = Navigator & {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

// Electron desktop bridge — injected by preload.js when running as a packaged app.
// Kiểu + khai báo `window.chatDesktop` nằm ở utils/desktopBridge.ts (nguồn duy
// nhất); khai lại ở đây sẽ xung đột kiểu.
import "./desktopBridge";

export interface BroadcastUnreadConversationSnapshot {
  conversationId: string;
  unreadCount: number;
  lastReadMessageId: string | null;
  lastReadAt: string | null;
  lastReadSeq?: number | null;
}

export interface BroadcastUnreadSnapshot {
  totalUnreadCount: number;
  conversations: BroadcastUnreadConversationSnapshot[];
  source: "socket" | "snapshot" | "cross_tab";
  syncedAtMs: number;
  sourceTabId: string;
}

interface BrowserNotificationInput {
  id: string;
  title: string;
  body: string;
  tag?: string;
  silent?: boolean;
  onClick?: () => void;
}

export interface DesktopNotificationInput extends Omit<
  BrowserNotificationInput,
  "silent"
> {
  /** Used when the user has disabled notification previews. */
  privateBody?: string;
}

const TITLE_BADGE_PATTERN = /^\(\d+\)\s+/;
const BROADCAST_CHANNEL_NAME = "chat-realtime-unread";
const STORAGE_EVENT_KEY = "chat:realtime:unread";
const TAB_ID = Math.random().toString(36).slice(2);
const browserNotificationCooldown = new Map<string, number>();
const DEFAULT_BROWSER_NOTIFICATION_COOLDOWN_MS = 15_000;

const canUseDom = (): boolean =>
  typeof window !== "undefined" && typeof document !== "undefined";

const getOriginalDocumentTitle = (): string => {
  if (!canUseDom()) {
    return "Chat";
  }

  const current = document.title.replace(TITLE_BADGE_PATTERN, "").trim();
  return current || "Chat";
};

export const isDocumentVisibleAndFocused = (): boolean => {
  if (!canUseDom()) {
    return false;
  }

  return document.visibilityState === "visible" && document.hasFocus();
};

export const syncDocumentTitleBadge = (totalUnreadCount: number): void => {
  if (!canUseDom()) {
    return;
  }

  const baseTitle = getOriginalDocumentTitle();
  document.title =
    totalUnreadCount > 0 ? `(${totalUnreadCount}) ${baseTitle}` : baseTitle;
};

export const syncAppBadge = async (totalUnreadCount: number): Promise<void> => {
  // Electron desktop: use branded gold/red overlay icon drawn by preload.js
  if (typeof window !== "undefined" && typeof window.chatDesktop?.setUnreadBadge === "function") {
    window.chatDesktop.setUnreadBadge(totalUnreadCount);
    return;
  }

  if (typeof navigator === "undefined") {
    return;
  }

  const badgeNavigator = navigator as NavigatorBadgeApi;
  try {
    if (totalUnreadCount > 0 && typeof badgeNavigator.setAppBadge === "function") {
      await badgeNavigator.setAppBadge(totalUnreadCount);
      return;
    }

    if (totalUnreadCount <= 0 && typeof badgeNavigator.clearAppBadge === "function") {
      await badgeNavigator.clearAppBadge();
    }
  } catch {
    // Browser badge support is best effort only.
  }
};

export const emitBrowserNotification = ({
  id,
  title,
  body,
  tag,
  silent = true,
  onClick,
}: BrowserNotificationInput): boolean => {
  const canUseDocument = canUseDom();
  const notificationType = typeof Notification;
  const permission =
    notificationType !== "undefined" ? Notification.permission : "undefined";
  const isDesktopBridge =
    typeof window !== "undefined" && Boolean(window.chatDesktop);

  notifyDebug("[emit] entry", {
    canUseDom: canUseDocument,
    notificationType,
    permission,
    title,
    tag,
  });

  if (!canUseDocument) {
    notifyDebug("[emit] BAIL dom unavailable", { title, tag });
    return false;
  }

  if (notificationType === "undefined") {
    notifyDebug("[emit] BAIL Notification unavailable", { title, tag });
    return false;
  }

  const permissionGranted = permission === "granted" || isDesktopBridge;
  if (!permissionGranted) {
    notifyDebug("[emit] BAIL permission", {
      permission,
      isDesktopBridge,
      title,
      tag,
    });
    return false;
  }

  const cooldownKey = tag ?? id;
  const now = Date.now();
  const lastAt = browserNotificationCooldown.get(cooldownKey) ?? 0;
  if (now - lastAt < DEFAULT_BROWSER_NOTIFICATION_COOLDOWN_MS) {
    notifyDebug("[emit] BAIL cooldown", {
      cooldownKey,
      remainingMs: DEFAULT_BROWSER_NOTIFICATION_COOLDOWN_MS - (now - lastAt),
    });
    return false;
  }
  browserNotificationCooldown.set(cooldownKey, now);

  const notification = new Notification(title, {
    body,
    tag: cooldownKey,
    silent,
  });

  if (typeof onClick === "function") {
    notification.onclick = () => {
      try {
        window.focus();
      } catch {
        // ignore focus errors
      }
      onClick();
      notification.close();
    };
  }

  notifyDebug("[emit] shown", { title, tag: cooldownKey });
  return true;
};

/**
 * The sole application-level OS notification entry point.
 *
 * Browser builds show a normal Notification; Electron's preload already
 * proxies that same API to the native Windows toast. New web features should
 * call this instead of `new Notification(...)` or a desktop-specific bridge.
 */
export const emitDesktopNotification = ({
  privateBody = "Bạn có thông báo mới.",
  ...input
}: DesktopNotificationInput): boolean => {
  const preferences = useSettingsStore.getState().notifications;
  if (!preferences.enabled || isDocumentVisibleAndFocused()) return false;

  return emitBrowserNotification({
    ...input,
    body: preferences.messagePreview ? input.body : privateBody,
    silent: !preferences.sound,
  });
};

export const clearBrowserNotificationCooldowns = (): void => {
  browserNotificationCooldown.clear();
};

export const broadcastUnreadSnapshot = (
  snapshot: Omit<BroadcastUnreadSnapshot, "sourceTabId">,
): void => {
  if (!canUseDom()) {
    return;
  }

  const payload: BroadcastUnreadSnapshot = {
    ...snapshot,
    sourceTabId: TAB_ID,
  };

  // BroadcastChannel primary: best-effort, no retry needed since localStorage
  // fallback provides eventual delivery.
  if (typeof BroadcastChannel !== "undefined") {
    try {
      const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      channel.postMessage(payload);
      channel.close();
    } catch {
      // BroadcastChannel errors (quota exceeded, origin not same, etc.) are
      // non-fatal. The localStorage fallback below provides cross-tab delivery.
    }
  }

  // localStorage secondary: always write so other tabs receive the update via
  // the storage event handler. This is the reliable delivery path.
  try {
    window.localStorage.setItem(STORAGE_EVENT_KEY, JSON.stringify(payload));
  } catch {
    // localStorage may throw if quota is exceeded or private browsing mode has
    // strict storage limits. This is non-fatal for cross-tab sync.
  }
};

export const subscribeUnreadSnapshotBroadcast = (
  handler: (snapshot: BroadcastUnreadSnapshot) => void,
): (() => void) => {
  if (!canUseDom()) {
    return () => {};
  }

  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== "undefined") {
    try {
      channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      channel.onmessage = (event: MessageEvent<BroadcastUnreadSnapshot>) => {
        const payload = event.data;
        if (!payload || payload.sourceTabId === TAB_ID) {
          return;
        }
        handler(payload);
      };
    } catch {
      // BroadcastChannel unavailable (e.g., cross-origin iframe context).
      channel = null;
    }
  }

  const storageHandler = (event: StorageEvent) => {
    if (event.key !== STORAGE_EVENT_KEY || !event.newValue) {
      return;
    }

    try {
      const payload = JSON.parse(event.newValue) as BroadcastUnreadSnapshot;
      if (!payload || payload.sourceTabId === TAB_ID) {
        return;
      }
      handler(payload);
    } catch {
      // Ignore malformed storage event payloads.
    }
  };

  window.addEventListener("storage", storageHandler);

  return () => {
    channel?.close();
    window.removeEventListener("storage", storageHandler);
  };
};
