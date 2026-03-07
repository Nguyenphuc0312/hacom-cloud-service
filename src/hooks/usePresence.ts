/**
 * @fileoverview usePresence hook
 * Subscribes to presence updates for a set of userIds (or conversation members).
 * Integrates with the WebSocket and presenceStore.
 */

import { useEffect, useCallback, useRef } from "react";
import { initSocket } from "../lib/socket";
import { WsEventNames } from "@hacom/chat-shared-types";
import {
  usePresenceStore,
  type UserPresenceInfo,
  type PresenceState,
} from "../stores/presenceStore";

// Debounce subscribe calls by 300ms
const SUBSCRIBE_DEBOUNCE_MS = 300;

interface UsePresenceOptions {
  /** User IDs to subscribe to */
  userIds?: string[];
  /** Conversation ID (server resolves members) */
  conversationId?: string;
  /**
   * @deprecated Use conversationId.
   */
  roomId?: string;
  /** Auto-subscribe on mount (default true) */
  enabled?: boolean;
}

interface UsePresenceReturn {
  /** Get presence info for a specific user */
  getPresence: (userId: string) => UserPresenceInfo;
  /** Check if user is online */
  isOnline: (userId: string) => boolean;
  /** Format last seen as relative time string */
  formatLastSeen: (userId: string) => string;
}

// ---- Helpers ----

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null;

/**
 * Format a last seen ISO timestamp to a human-readable string.
 */
function formatLastSeenTime(isoString?: string): string {
  if (!isoString) return "";

  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;

  return date.toLocaleDateString();
}

export function usePresence(
  options: UsePresenceOptions = {},
): UsePresenceReturn {
  const { userIds, enabled = true } = options;
  const conversationId = options.conversationId ?? options.roomId;

  const setPresence = usePresenceStore((s) => s.setPresence);
  const setPresenceBatch = usePresenceStore((s) => s.setPresenceBatch);
  const getPresence = usePresenceStore((s) => s.getPresence);
  const isOnline = usePresenceStore((s) => s.isOnline);

  const subscribeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subscribedRef = useRef(false);

  // Subscribe to presence for the given users/conversation.
  const subscribe = useCallback(() => {
    const socket = initSocket();
    if (!socket.isConnected()) return;

    const payload: Record<string, unknown> = {};
    if (userIds && userIds.length > 0) payload.userIds = userIds;
    if (conversationId) {
      payload.conversationId = conversationId;
      payload.roomId = conversationId;
    }
    if (!payload.userIds && !payload.roomId) return;

    socket.send("presence:subscribe", payload);
    subscribedRef.current = true;
  }, [conversationId, userIds]);

  const unsubscribe = useCallback(() => {
    if (!subscribedRef.current) return;

    const socket = initSocket();
    if (!socket.isConnected()) return;

    const payload: Record<string, unknown> = {};
    if (userIds && userIds.length > 0) payload.userIds = userIds;
    if (conversationId) {
      payload.conversationId = conversationId;
      payload.roomId = conversationId;
    }

    socket.send("presence:unsubscribe", payload);
    subscribedRef.current = false;
  }, [conversationId, userIds]);

  // Listen for presence events
  useEffect(() => {
    if (!enabled) return;

    const socket = initSocket();

    // Handler for presence:update
    const handlePresenceUpdate = (data: unknown) => {
      const payload = asRecord(data);
      if (!payload) return;

      const userId =
        asString(payload.userId) ?? asString(payload.senderId) ?? null;
      if (!userId) return;

      const state =
        (asString(payload.state) as PresenceState) ??
        (asString(payload.status) as PresenceState) ??
        "offline";

      setPresence({
        userId,
        state,
        lastSeenAt: asString(payload.lastSeenAt) ?? undefined,
        updatedAt: asString(payload.updatedAt) ?? new Date().toISOString(),
        username: asString(payload.username) ?? undefined,
      });
    };

    // Handler for presence:snapshot
    const handlePresenceSnapshot = (data: unknown) => {
      const payload = asRecord(data);
      if (!payload) return;

      const items = Array.isArray(payload.items) ? payload.items : [];
      const parsed: UserPresenceInfo[] = [];

      for (const raw of items) {
        const item = asRecord(raw);
        if (!item) continue;

        const userId = asString(item.userId);
        if (!userId) continue;

        parsed.push({
          userId,
          state: (asString(item.state) as PresenceState) ?? "offline",
          lastSeenAt: asString(item.lastSeenAt) ?? undefined,
          updatedAt: asString(item.updatedAt) ?? new Date().toISOString(),
          username: asString(item.username) ?? undefined,
        });
      }

      if (parsed.length > 0) {
        setPresenceBatch(parsed);
      }
    };

    const unsubUpdate = socket.on(
      WsEventNames.PRESENCE_UPDATE,
      handlePresenceUpdate,
    );
    const unsubSnapshot = socket.on(
      "presence:snapshot",
      handlePresenceSnapshot,
    );

    // Debounced subscribe
    if (subscribeTimerRef.current) {
      clearTimeout(subscribeTimerRef.current);
    }
    subscribeTimerRef.current = setTimeout(() => {
      subscribe();
    }, SUBSCRIBE_DEBOUNCE_MS);

    // Re-subscribe on reconnect
    const unsubConnect = socket.on("connect", () => {
      subscribe();
    });

    return () => {
      unsubUpdate();
      unsubSnapshot();
      unsubConnect();
      if (subscribeTimerRef.current) {
        clearTimeout(subscribeTimerRef.current);
      }
      unsubscribe();
    };
  }, [enabled, subscribe, unsubscribe, setPresence, setPresenceBatch]);

  const formatLastSeen = useCallback(
    (userId: string) => {
      const info = getPresence(userId);
      if (info.state !== "offline") return "";
      return formatLastSeenTime(info.lastSeenAt);
    },
    [getPresence],
  );

  return {
    getPresence,
    isOnline,
    formatLastSeen,
  };
}

export default usePresence;
