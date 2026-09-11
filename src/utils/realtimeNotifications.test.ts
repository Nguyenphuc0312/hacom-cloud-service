import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSettingsStore } from "../settings/settingsStore";
import {
  clearBrowserNotificationCooldowns,
  emitDesktopNotification,
} from "./realtimeNotifications";

const notifications: Array<{ title: string; body: string; silent: boolean }> = [];

class MockNotification {
  static permission = "granted";
  onclick: (() => void) | null = null;
  constructor(title: string, options: NotificationOptions) {
    notifications.push({
      title,
      body: options.body ?? "",
      silent: options.silent === true,
    });
  }
  close() {}
}

describe("emitDesktopNotification", () => {
  beforeEach(() => {
    notifications.length = 0;
    clearBrowserNotificationCooldowns();
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    Object.defineProperty(globalThis, "Notification", {
      configurable: true,
      value: MockNotification,
    });
    useSettingsStore.setState((state) => ({
      notifications: {
        ...state.notifications,
        enabled: true,
        sound: true,
        messagePreview: true,
      },
    }));
  });

  afterEach(() => vi.restoreAllMocks());

  it("uses the standard Notification path with the full preview", () => {
    expect(emitDesktopNotification({ id: "friend-1", title: "Sếp Quang", body: "Đã gửi lời mời kết bạn" })).toBe(true);
    expect(notifications).toEqual([
      { title: "Sếp Quang", body: "Đã gửi lời mời kết bạn", silent: false },
    ]);
  });

  it("never leaks the preview when the user turns it off", () => {
    useSettingsStore.setState((state) => ({
      notifications: { ...state.notifications, messagePreview: false, sound: false },
    }));
    emitDesktopNotification({
      id: "calendar-1",
      title: "Họp dự án",
      body: "Sếp Quang đã mời bạn lúc 09:00",
      privateBody: "Bạn có thông báo lịch mới.",
    });
    expect(notifications).toEqual([
      { title: "Họp dự án", body: "Bạn có thông báo lịch mới.", silent: true },
    ]);
  });
});
