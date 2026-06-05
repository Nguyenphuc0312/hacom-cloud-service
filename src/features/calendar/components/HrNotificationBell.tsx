/**
 * HrNotificationBell — surfaces hr-api-service in-app notifications (calendar
 * meeting invites / responses) inside chat-web-client via short polling.
 * The HR calendar is an optional feature, so all fetches fail silently.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BellIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";

import {
  hrNotificationApi,
  type HrAppNotification,
} from "../../api/hrNotificationApi";

const POLL_MS = 30_000;

const relativeTime = (iso: string): string => {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return "Vừa xong";
  if (diffMin < 60) return `${diffMin} phút trước`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} ngày trước`;
  return new Date(iso).toLocaleDateString("vi-VN");
};

const actionUrlOf = (n: HrAppNotification): string | null => {
  const fromPayload =
    n.payload && typeof n.payload["actionUrl"] === "string"
      ? (n.payload["actionUrl"] as string)
      : null;
  if (fromPayload) return fromPayload;
  if (n.entityType === "CALENDAR_EVENT" && n.entityId) {
    return `/calendar?eventId=${n.entityId}`;
  }
  return null;
};

export const HrNotificationBell: React.FC = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<HrAppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const [list, count] = await Promise.all([
        hrNotificationApi.list({ page: 1, pageSize: 20 }),
        hrNotificationApi.unreadCount(),
      ]);
      if (!mountedRef.current) return;
      setItems(list);
      setUnread(count);
    } catch {
      // Optional feature — ignore (HR not linked, network, 401/403, etc.)
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    // refresh() is async — setState runs after `await`, not synchronously — so
    // this is a genuine data-fetch/poll, not the cascading-render pattern the
    // rule targets.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(timer);
    };
  }, [refresh]);

  const handleOpen = async (n: HrAppNotification) => {
    setOpen(false);
    if (!n.readAt) {
      try {
        await hrNotificationApi.markRead(n.id);
      } catch {
        /* ignore */
      }
      void refresh();
    }
    const url = actionUrlOf(n);
    if (url) navigate(url);
  };

  const handleMarkAll = async () => {
    try {
      await hrNotificationApi.markAllRead();
    } catch {
      /* ignore */
    }
    void refresh();
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Thông báo lịch họp"
        className="relative rounded-lg p-1.5 text-text-muted transition-micro hover:bg-surface-hover hover:text-text-primary"
      >
        <BellIcon className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Đóng"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-sm font-semibold text-text-primary">
                Thông báo
              </span>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={() => void handleMarkAll()}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Đánh dấu đã đọc
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-text-muted">
                  Không có thông báo
                </p>
              ) : (
                items.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => void handleOpen(n)}
                    className={clsx(
                      "flex w-full gap-2 border-t border-border px-4 py-2.5 text-left transition-micro hover:bg-surface-hover",
                      !n.readAt && "bg-[#1976D2]/5",
                    )}
                  >
                    {!n.readAt && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#1976D2]" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span
                        className={clsx(
                          "block truncate text-sm text-text-primary",
                          n.readAt ? "font-normal" : "font-semibold",
                        )}
                      >
                        {n.title}
                      </span>
                      {n.body && (
                        <span className="mt-0.5 block line-clamp-2 text-xs text-text-muted">
                          {n.body}
                        </span>
                      )}
                      <span className="mt-0.5 block text-[11px] text-text-muted">
                        {relativeTime(n.createdAt)}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default HrNotificationBell;
