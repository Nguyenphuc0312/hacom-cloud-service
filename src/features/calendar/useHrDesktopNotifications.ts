import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { hrNotificationApi, type HrAppNotification } from "../api/hrNotificationApi";
import { useFriendshipStore } from "../../stores/friendshipStore";
import {
  emitDesktopNotification,
} from "../../utils/realtimeNotifications";
import { eventTitleOf } from "./utils/parseNotificationBody";
import { refreshHrUnreadCount } from "./useHrUnreadCount";

const POLL_MS = 30_000;

const payloadText = (item: HrAppNotification, key: string): string => {
  const value = item.payload?.[key];
  return typeof value === "string" ? value.trim() : "";
};

const notificationPresentation = (item: HrAppNotification) => {
  const chairmanUserId =
    payloadText(item, "meetingChairmanAuthUserId") || payloadText(item, "actorAuthUserId");
  const alias =
    chairmanUserId
      ? useFriendshipStore.getState().friendByUserId[chairmanUserId]?.alias?.trim()
      : "";
  const chairman = alias || payloadText(item, "meetingChairman") || item.actorName || "Chủ trì cuộc họp";
  const content =
    payloadText(item, "eventContent") || eventTitleOf(item.payload, item.body) || "Nội dung cuộc họp";
  return { chairman, content };
};

const actionPath = (item: HrAppNotification): string | null => {
  const actionUrl = payloadText(item, "actionUrl");
  if (actionUrl.startsWith("/") && !actionUrl.startsWith("//")) return actionUrl;
  return item.entityId ? `/calendar?eventId=${encodeURIComponent(item.entityId)}` : null;
};

/** Native notification bridge for HR calendar events, active on every app route. */
export const useHrDesktopNotifications = (): void => {
  const navigate = useNavigate();
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
          const { chairman, content } = notificationPresentation(item);
          emitDesktopNotification({
            id: item.id,
            tag: `calendar:${item.id}`,
            title: chairman,
            body: content,
            privateBody: "Bạn có thông báo lịch mới.",
            onClick: () => {
              const destination = actionPath(item);
              if (destination) navigate(destination);
            },
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
  }, [navigate]);
};
