/**
 * @fileoverview usePinnedMessages hook
 * Manages pinned messages for a conversation with optimistic pin/unpin.
 *
 * Nguồn sự thật cho cờ `isPinned` trên message trong RTK cache cũng nằm ở đây:
 * menu Ghim/Bỏ ghim và togglePin đều đọc `message.isPinned`, nên mọi thay đổi
 * pin (tự bấm, realtime, mở hội thoại) phải patch ngược vào cache — nếu không
 * FE sẽ luôn tưởng "chưa ghim" và toggle sai chiều (bug ghim trùng 2-3 lần).
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { messageApi } from "../services/api";
import { extractApiError } from "../lib/apiContract";
import { resolveConversationId } from "../lib/conversationIdentity";
import { useAppDispatch } from "../store/hooks";
import { chatApi } from "../features/api/chatApi";
import type { Message } from "../types";

const LOCAL_PIN_DEMO = import.meta.env.VITE_LOCAL_PIN_DEMO === "true";
const LOCAL_PIN_STORAGE_KEY = "hacom.local.pinned-messages.v1";

const readLocalPins = (conversationId: string): Message[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_PIN_STORAGE_KEY);
    const data = raw ? (JSON.parse(raw) as Record<string, Message[]>) : {};
    return Array.isArray(data[conversationId]) ? data[conversationId] : [];
  } catch {
    return [];
  }
};

const writeLocalPins = (conversationId: string, messages: Message[]): void => {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(LOCAL_PIN_STORAGE_KEY);
    const data = raw ? (JSON.parse(raw) as Record<string, Message[]>) : {};
    data[conversationId] = messages;
    window.localStorage.setItem(LOCAL_PIN_STORAGE_KEY, JSON.stringify(data));
    window.dispatchEvent(
      new CustomEvent("local:pins:updated", { detail: { conversationId } }),
    );
  } catch {
    // Local demo storage is best-effort; the in-memory state still works.
  }
};

interface UsePinnedMessagesReturn {
  pinnedMessages: Message[];
  isLoading: boolean;
  error: string | null;
  fetchPinned: () => Promise<void>;
  togglePin: (message: Message) => Promise<boolean>;
  /** Remove a pin as part of a destructive message/item action. */
  removePin: (messageId: string) => Promise<boolean>;
}

interface UsePinnedMessagesOptions {
  /**
   * Cloud của tôi can run against an independent API that may not expose
   * the chat pin endpoints yet. Keep the same UI contract and persist locally
   * until that endpoint is available, without changing ordinary chat behavior.
   */
  localFallback?: boolean;
}

export const usePinnedMessages = (
  conversationId: string | null,
  options: UsePinnedMessagesOptions = {},
): UsePinnedMessagesReturn => {
  const localFallback = options.localFallback === true;
  const dispatch = useAppDispatch();
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef<string | null>(null);

  const patchIsPinned = useCallback(
    (messageId: string, pinned: boolean) => {
      if (!conversationId) return;
      dispatch(
        chatApi.util.updateQueryData(
          "getMessages",
          { conversationId },
          (draft) => {
            const msg = draft.messages.find((m) => m.id === messageId);
            if (msg) msg.isPinned = pinned;
          },
        ),
      );
    },
    [conversationId, dispatch],
  );

  /** Đồng bộ isPinned của toàn timeline theo danh sách ghim từ server. */
  const syncPinnedFlags = useCallback(
    (pinned: Message[]) => {
      if (!conversationId) return;
      const pinnedIds = new Set(pinned.map((m) => m.id));
      dispatch(
        chatApi.util.updateQueryData(
          "getMessages",
          { conversationId },
          (draft) => {
            for (const msg of draft.messages) {
              const flag = pinnedIds.has(msg.id);
              if (msg.isPinned !== flag) msg.isPinned = flag;
            }
          },
        ),
      );
    },
    [conversationId, dispatch],
  );

  const fetchPinned = useCallback(async () => {
    if (!conversationId) return;
    setIsLoading(true);
    setError(null);

    if (LOCAL_PIN_DEMO) {
      const messages = readLocalPins(conversationId);
      setPinnedMessages(messages);
      syncPinnedFlags(messages);
      setIsLoading(false);
      return;
    }

    try {
      const response = await messageApi.getPinnedMessages(conversationId);
      if (response.success) {
        const raw = response.data.messages ?? [];
        // Dedupe theo id — DB có thể còn bản ghi ghim trùng từ trước khi fix toggle
        const messages = raw.filter(
          (m, index) => raw.findIndex((other) => other.id === m.id) === index,
        );
        setPinnedMessages(messages);
        syncPinnedFlags(messages);
      }
    } catch (err) {
      if (localFallback) {
        const messages = readLocalPins(conversationId);
        setPinnedMessages(messages);
        syncPinnedFlags(messages);
        setError(null);
        setIsLoading(false);
        return;
      }
      const apiErr = extractApiError(err);
      setError(apiErr.message);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, localFallback, syncPinnedFlags]);

  useEffect(() => {
    if (conversationId && conversationId !== fetchedRef.current) {
      fetchedRef.current = conversationId;
      fetchPinned();
    }
  }, [conversationId, fetchPinned]);

  useEffect(() => {
    if (!LOCAL_PIN_DEMO || !conversationId || typeof window === "undefined") {
      return;
    }

    const refresh = () => {
      const messages = readLocalPins(conversationId);
      setPinnedMessages(messages);
      syncPinnedFlags(messages);
    };
    window.addEventListener("local:pins:updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("local:pins:updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [conversationId, syncPinnedFlags]);

  useEffect(() => {
    if (!conversationId || typeof window === "undefined") return;

    const handler = (event: Event) => {
      const custom = event as CustomEvent<Record<string, unknown> | undefined>;
      const updatedConversationId = resolveConversationId(custom.detail, {
        source: "usePinnedMessages.group:pin:updated",
      });
      if (updatedConversationId === conversationId) {
        void fetchPinned();
      }
    };

    window.addEventListener("group:pin:updated", handler as EventListener);
    return () => {
      window.removeEventListener("group:pin:updated", handler as EventListener);
    };
  }, [conversationId, fetchPinned]);

  // Deletion is initiated by the page that owns the confirmation dialog, not
  // by this hook. Listen for the shared completion event so every mounted pin
  // surface (bar, side panel and info panel) drops the deleted message in the
  // same tick without waiting for a refetch.
  useEffect(() => {
    if (!conversationId || typeof window === "undefined") return;

    const handleMessageDeleted = (event: Event) => {
      const custom = event as CustomEvent<{
        conversationId?: unknown;
        messageId?: unknown;
      }>;
      if (
        typeof custom.detail?.messageId !== "string" ||
        (typeof custom.detail.conversationId === "string" &&
          custom.detail.conversationId !== conversationId)
      ) {
        return;
      }

      const messageId = custom.detail.messageId;
      setPinnedMessages((prev) => prev.filter((message) => message.id !== messageId));
      patchIsPinned(messageId, false);

      if (LOCAL_PIN_DEMO) {
        const next = readLocalPins(conversationId).filter(
          (message) => message.id !== messageId,
        );
        writeLocalPins(conversationId, next);
      }
    };

    window.addEventListener("message:deleted", handleMessageDeleted as EventListener);
    return () => {
      window.removeEventListener("message:deleted", handleMessageDeleted as EventListener);
    };
  }, [conversationId, patchIsPinned]);

  const togglePin = useCallback(
    async (message: Message): Promise<boolean> => {
      if (!conversationId) return false;

      const isPinned = message.isPinned ?? false;

      // Optimistic update — dedupe theo id để không bao giờ có 2 entry cùng tin
      if (isPinned) {
        setPinnedMessages((prev) => prev.filter((m) => m.id !== message.id));
      } else {
        setPinnedMessages((prev) => [
          { ...message, isPinned: true },
          ...prev.filter((m) => m.id !== message.id),
        ]);
      }
      patchIsPinned(message.id, !isPinned);

      if (LOCAL_PIN_DEMO) {
        const next = isPinned
          ? readLocalPins(conversationId).filter((item) => item.id !== message.id)
          : [
              { ...message, isPinned: true },
              ...readLocalPins(conversationId).filter(
                (item) => item.id !== message.id,
              ),
            ];
        writeLocalPins(conversationId, next);
        setError(null);
        return true;
      }

      try {
        if (isPinned) {
          await messageApi.unpinMessage(message.id);
        } else {
          await messageApi.pinMessage(message.id);
        }
        return true;
      } catch (err) {
        if (localFallback) {
          const next = isPinned
            ? readLocalPins(conversationId).filter((item) => item.id !== message.id)
            : [
                { ...message, isPinned: true },
                ...readLocalPins(conversationId).filter(
                  (item) => item.id !== message.id,
                ),
              ];
          writeLocalPins(conversationId, next);
          setError(null);
          return true;
        }
        // Revert optimistic update
        if (isPinned) {
          setPinnedMessages((prev) => [
            { ...message, isPinned: true },
            ...prev.filter((m) => m.id !== message.id),
          ]);
        } else {
          setPinnedMessages((prev) => prev.filter((m) => m.id !== message.id));
        }
        patchIsPinned(message.id, isPinned);
        const apiErr = extractApiError(err);
        setError(apiErr.message);
        return false;
      }
    },
    [conversationId, localFallback, patchIsPinned],
  );

  /**
   * Remove a pin without relying on the message still being present in the
   * timeline. Delete/trash actions can remove that row before the pin panel
   * re-renders, so they must use the stable message id directly.
   *
   * The optimistic state change happens before the API call. This guarantees
   * the pin bar/panel disappears immediately after a successful delete. Cloud
   * uses the local fallback when its pin endpoint is unavailable, while the
   * normal chat path keeps the server as the source of truth.
   */
  const removePin = useCallback(
    async (messageId: string): Promise<boolean> => {
      if (!conversationId || !messageId) return false;

      const wasPinned = pinnedMessages.some((message) => message.id === messageId);
      setPinnedMessages((prev) => prev.filter((message) => message.id !== messageId));
      patchIsPinned(messageId, false);

      // A delete can race a stale timeline refresh. Keep the local demo/fallback
      // copy in sync even when the deleted message is no longer in the cache.
      const persistLocalRemoval = () => {
        const next = readLocalPins(conversationId).filter(
          (message) => message.id !== messageId,
        );
        writeLocalPins(conversationId, next);
      };

      // Cloud can be running from the local fallback even while the initial
      // server pin request is still loading. Remove the persisted copy even
      // when the in-memory list has not observed the pin yet.
      if (LOCAL_PIN_DEMO || localFallback) {
        persistLocalRemoval();
      }

      if (!wasPinned) return true;

      if (LOCAL_PIN_DEMO) {
        persistLocalRemoval();
        setError(null);
        return true;
      }

      try {
        // The backend pin endpoint is a toggle. Re-read the server list first
        // so a delete that already cascaded its pin does not accidentally
        // toggle the now-missing pin back on.
        const response = await messageApi.getPinnedMessages(conversationId);
        const serverPins = response.success ? response.data.messages ?? [] : [];
        if (serverPins.some((message) => message.id === messageId)) {
          await messageApi.unpinMessage(messageId);
        }
        return true;
      } catch (err) {
        if (localFallback) {
          persistLocalRemoval();
          setError(null);
          return true;
        }

        const apiErr = extractApiError(err);
        setError(apiErr.message);
        // Keep the optimistic removal: the message has already been deleted,
        // so showing a dead pin is worse than surfacing a recoverable error.
        return false;
      }
    },
    [conversationId, localFallback, patchIsPinned, pinnedMessages],
  );

  return {
    pinnedMessages,
    isLoading,
    error,
    fetchPinned,
    togglePin,
    removePin,
  };
};

export default usePinnedMessages;
