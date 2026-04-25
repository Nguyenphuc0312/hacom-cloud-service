type NavigatorBadgeApi = Navigator & {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

export interface BroadcastUnreadConversationSnapshot {
  conversationId: string;
  unreadCount: number;
  lastReadMessageId: string | null;
  lastReadAt: string | null;
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
  if (
    !canUseDom() ||
    typeof Notification === "undefined" ||
    Notification.permission !== "granted"
  ) {
    return false;
  }

  const cooldownKey = tag ?? id;
  const now = Date.now();
  const lastAt = browserNotificationCooldown.get(cooldownKey) ?? 0;
  if (now - lastAt < DEFAULT_BROWSER_NOTIFICATION_COOLDOWN_MS) {
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

  return true;
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

  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    channel.postMessage(payload);
    channel.close();
  }

  window.localStorage.setItem(STORAGE_EVENT_KEY, JSON.stringify(payload));
};

export const subscribeUnreadSnapshotBroadcast = (
  handler: (snapshot: BroadcastUnreadSnapshot) => void,
): (() => void) => {
  if (!canUseDom()) {
    return () => {};
  }

  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    channel.onmessage = (event: MessageEvent<BroadcastUnreadSnapshot>) => {
      const payload = event.data;
      if (!payload || payload.sourceTabId === TAB_ID) {
        return;
      }
      handler(payload);
    };
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
