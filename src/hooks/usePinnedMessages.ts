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

interface UsePinnedMessagesReturn {
  pinnedMessages: Message[];
  isLoading: boolean;
  error: string | null;
  fetchPinned: () => Promise<void>;
  togglePin: (message: Message) => Promise<boolean>;
}

export const usePinnedMessages = (
  conversationId: string | null,
): UsePinnedMessagesReturn => {
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
      const apiErr = extractApiError(err);
      setError(apiErr.message);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, syncPinnedFlags]);

  useEffect(() => {
    if (conversationId && conversationId !== fetchedRef.current) {
      fetchedRef.current = conversationId;
      fetchPinned();
    }
  }, [conversationId, fetchPinned]);

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

      try {
        if (isPinned) {
          await messageApi.unpinMessage(message.id);
        } else {
          await messageApi.pinMessage(message.id);
        }
        return true;
      } catch (err) {
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
    [conversationId, patchIsPinned],
  );

  return {
    pinnedMessages,
    isLoading,
    error,
    fetchPinned,
    togglePin,
  };
};

export default usePinnedMessages;
