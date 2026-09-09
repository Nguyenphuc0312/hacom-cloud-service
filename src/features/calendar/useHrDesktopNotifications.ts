import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { hrNotificationApi, type HrAppNotification } from "../api/hrNotificationApi";
import { useFriendshipStore } from "../../stores/friendshipStore";
import {
  emitDesktopNotification,
} from "../../utils/realtimeNotifications";
import { eventTitleOf } from "./utils/parseNotificationBody";
import { refreshHrUnreadCount } from "./useHrUnreadCount";

// HR currently has no websocket event for calendar notifications; poll quickly and
// refresh instantly on returning to the app. The in-flight guard prevents overlap.
export const HR_NOTIFICATION_POLL_MS = 750;

const payloadText = (item: HrAppNotification, key: string): string => {
  const value = item.payload?.[key];
  return typeof value === "string" ? value.trim() : "";
};

export const notificationPresentation = (item: HrAppNotification) => {
  const chairmanUserId =
    payloadText(item, "meetingChairmanAuthUserId") || payloadText(item, "actorAuthUserId");
  const alias =
    chairmanUserId
      ? useFriendshipStore.getState().friendByUserId[chairmanUserId]?.alias?.trim()
      : "";
  const chairman = alias || payloadText(item, "meetingChairman") || item.actorName || "Chủ trì cuộc họp";
  const content =
    payloadText(item, "eventContent") || eventTitleOf(item.payload, item.body) || "Nội dung cuộc họp";
  const isInvite = item.type === "calendar.meeting.invited" ||
    item.type === "calendar.meeting.joined_via_share_link";
  return {
    title: isInvite ? "Lịch họp · Lời mời tham gia" : "Lịch họp · Cập nhật",
    body: ["Chủ trì: " + chairman, content].join("\n"),
  };
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
  const inFlightRef = useRef(false);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
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
          const { title, body } = notificationPresentation(item);
          emitDesktopNotification({
            id: item.id,
            tag: `calendar:${item.id}`,
            title,
            body,
            privateBody: "Bạn có thông báo lịch mới.",
            onClick: () => {
              const destination = actionPath(item);
              if (destination) navigate(destination);
            },
          });
        }
      } catch {
        // Calendar is optional; the next poll retries silently.
      } finally {
        inFlightRef.current = false;
      }
    };

    const refreshWhenActive = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), HR_NOTIFICATION_POLL_MS);
    window.addEventListener("focus", refreshWhenActive);
    document.addEventListener("visibilitychange", refreshWhenActive);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshWhenActive);
      document.removeEventListener("visibilitychange", refreshWhenActive);
    };
  }, [navigate]);
};
