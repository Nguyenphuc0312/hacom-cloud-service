import { beforeEach, describe, expect, it } from "vitest";

import { useNotificationStore } from "./notificationStore";

describe("notificationStore", () => {
  beforeEach(() => {
    useNotificationStore.getState().reset();
  });

  it("deduplicates notifications by id and preserves read state", () => {
    useNotificationStore.getState().upsertNotification({
      id: "notif-1",
      kind: "message",
      title: "Room 1",
      body: "Hello",
      createdAt: "2026-04-15T10:00:00.000Z",
      conversationId: "room-1",
      isRead: false,
    });

    useNotificationStore.getState().markAsRead("notif-1");
    useNotificationStore.getState().upsertNotification({
      id: "notif-1",
      kind: "message",
      title: "Room 1",
      body: "Hello again",
      createdAt: "2026-04-15T10:01:00.000Z",
      conversationId: "room-1",
      isRead: false,
    });

    const items = useNotificationStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0]?.body).toBe("Hello again");
    expect(items[0]?.isRead).toBe(true);
  });

  it("marks all notifications in a conversation as read", () => {
    useNotificationStore.getState().upsertNotification({
      id: "notif-room-1",
      kind: "message",
      title: "Room 1",
      body: "A",
      createdAt: "2026-04-15T10:00:00.000Z",
      conversationId: "room-1",
    });
    useNotificationStore.getState().upsertNotification({
      id: "notif-room-2",
      kind: "mention",
      title: "Room 2",
      body: "B",
      createdAt: "2026-04-15T10:01:00.000Z",
      conversationId: "room-2",
    });

    useNotificationStore.getState().markConversationAsRead("room-1");

    const items = useNotificationStore.getState().items;
    expect(items.find((item) => item.id === "notif-room-1")?.isRead).toBe(true);
    expect(items.find((item) => item.id === "notif-room-2")?.isRead).toBe(
      false,
    );
  });
});
