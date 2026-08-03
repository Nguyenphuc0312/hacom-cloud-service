/**
 * Shared unread count for hr-api notifications (calendar invites/responses).
 * Module-level so the SideRail badge and HrNotificationBell poll ONCE between
 * them and always show the same number — two independent pollers would drift.
 * HR is an optional feature: every fetch fails silently to 0.
 */

import { useEffect, useState } from "react";

import { hrNotificationApi } from "../api/hrNotificationApi";

const POLL_MS = 30_000;

let count = 0;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<(n: number) => void>();

const refresh = async () => {
  try {
    const next = await hrNotificationApi.unreadCount();
    if (next === count) return;
    count = next;
    listeners.forEach((fn) => fn(count));
  } catch {
    // Optional feature — HR not linked, offline, 401/403. Keep last known.
  }
};

/** Call after marking read so the badge drops without waiting for the poll. */
export const refreshHrUnreadCount = () => void refresh();

export const useHrUnreadCount = (): number => {
  const [value, setValue] = useState(count);

  useEffect(() => {
    listeners.add(setValue);
    // Start the shared poll on the first subscriber only.
    if (!timer) {
      void refresh();
      timer = setInterval(() => void refresh(), POLL_MS);
    }
    return () => {
      listeners.delete(setValue);
      if (listeners.size === 0 && timer) {
        clearInterval(timer);
        timer = null;
      }
    };
  }, []);

  return value;
};
