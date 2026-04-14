import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  broadcastUnreadSnapshot,
  clearBrowserNotificationCooldowns,
  emitBrowserNotification,
  subscribeUnreadSnapshotBroadcast,
  syncAppBadge,
  syncDocumentTitleBadge,
} from "./realtimeNotifications";

describe("realtimeNotifications", () => {
  const originalTitle = document.title;
  const originalNotification = globalThis.Notification;
  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    document.title = "Workspace Chat";
    window.localStorage.clear();
    clearBrowserNotificationCooldowns();
  });

  afterEach(() => {
    document.title = originalTitle;
    if (originalNotification) {
      globalThis.Notification = originalNotification;
    } else {
      // @ts-expect-error test cleanup for browsers without Notification
      delete globalThis.Notification;
    }
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it("syncs title badge without stacking prefixes", () => {
    syncDocumentTitleBadge(4);
    expect(document.title).toBe("(4) Workspace Chat");

    syncDocumentTitleBadge(2);
    expect(document.title).toBe("(2) Workspace Chat");

    syncDocumentTitleBadge(0);
    expect(document.title).toBe("Workspace Chat");
  });

  it("updates the app badge when supported", async () => {
    const setAppBadge = vi.fn().mockResolvedValue(undefined);
    const clearAppBadge = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, "navigator", {
      value: {
        ...originalNavigator,
        setAppBadge,
        clearAppBadge,
      },
      configurable: true,
    });

    await syncAppBadge(6);
    await syncAppBadge(0);

    expect(setAppBadge).toHaveBeenCalledWith(6);
    expect(clearAppBadge).toHaveBeenCalledTimes(1);
  });

  it("deduplicates browser notifications by tag within cooldown", () => {
    const notificationSpy = vi.fn();

    class MockNotification {
      static permission: NotificationPermission = "granted";
      onclick: (() => void) | null = null;

      constructor(title: string, options?: NotificationOptions) {
        notificationSpy({ title, options });
      }

      close() {}
    }

    globalThis.Notification =
      MockNotification as unknown as typeof Notification;

    expect(
      emitBrowserNotification({
        id: "message:1",
        tag: "conversation:1",
        title: "Room 1",
        body: "Hello",
      }),
    ).toBe(true);
    expect(
      emitBrowserNotification({
        id: "message:1-duplicate",
        tag: "conversation:1",
        title: "Room 1",
        body: "Hello again",
      }),
    ).toBe(false);
    expect(notificationSpy).toHaveBeenCalledTimes(1);
  });

  it("receives unread snapshots via storage fallback for cross-tab sync", () => {
    const handler = vi.fn();
    const unsubscribe = subscribeUnreadSnapshotBroadcast(handler);

    broadcastUnreadSnapshot({
      totalUnreadCount: 3,
      conversations: [
        {
          conversationId: "room-1",
          unreadCount: 3,
          lastReadMessageId: null,
          lastReadAt: null,
        },
      ],
      source: "snapshot",
      syncedAtMs: Date.now(),
    });

    const rawPayload = window.localStorage.getItem("chat:realtime:unread");
    expect(rawPayload).toBeTruthy();
    const remotePayload = JSON.stringify({
      ...JSON.parse(rawPayload ?? "{}"),
      sourceTabId: "remote-tab",
    });

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "chat:realtime:unread",
        newValue: remotePayload,
      }),
    );

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[0]?.totalUnreadCount).toBe(3);

    unsubscribe();
  });
});
