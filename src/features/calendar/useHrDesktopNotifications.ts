import { useEffect, useRef } from "react";
import { hrNotificationApi, type HrAppNotification } from "../api/hrNotificationApi";
import { useFriendshipStore } from "../../stores/friendshipStore";
import {
  emitDesktopNotification,
} from "../../utils/realtimeNotifications";
import { eventTitleOf } from "./utils/parseNotificationBody";
import { refreshHrUnreadCount } from "./useHrUnreadCount";

const POLL_MS = 30_000;

const notificationBody = (item: HrAppNotification, preview: boolean): string => {
  if (!preview) return "Bạn có thông báo lịch mới.";
  const actorUserId = item.payload?.["actorAuthUserId"];
  const alias =
    typeof actorUserId === "string"
      ? useFriendshipStore.getState().friendByUserId[actorUserId]?.alias?.trim()
      : "";
  return item.actorName && alias
    ? (item.title || "Thông báo lịch họp").replaceAll(item.actorName, alias)
    : item.title || alias || item.actorName || "Thông báo lịch họp";
};

/** Native notification bridge for HR calendar events, active on every app route. */
export const useHrDesktopNotifications = (): void => {
  const knownIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      refreshHrUnreadCount();
      try {
        const items = await hrNotificationApi.list({ page: 1, pageSize: 20 });
        if (!active) return;
        const knownIds = knownIdsRef.current;
        if (!knownIds) {
          knownIdsRef.current = new Set(items.map((item) => item.id));
          return;
        }

        for (const item of items) {
          if (knownIds.has(item.id)) continue;
          knownIds.add(item.id);
          if (item.readAt) continue;
          emitDesktopNotification({
            id: item.id,
            tag: `calendar:${item.id}`,
            title: eventTitleOf(item.payload, item.body) || item.title || "Lịch họp",
            body: notificationBody(item, true),
            privateBody: notificationBody(item, false),
          });
        }
      } catch {
        // Calendar is optional; the next poll retries silently.
      }
    };

    void refresh();
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);
};
