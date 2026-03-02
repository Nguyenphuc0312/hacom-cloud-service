/**
 * @fileoverview usePinnedMessages hook
 * Manages pinned messages for a room with optimistic pin/unpin.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { messageApi } from "../services/api";
import { extractApiError } from "../lib/apiContract";
import type { Message } from "../types";

interface UsePinnedMessagesReturn {
  pinnedMessages: Message[];
  isLoading: boolean;
  error: string | null;
  fetchPinned: () => Promise<void>;
  togglePin: (message: Message) => Promise<boolean>;
}

export const usePinnedMessages = (
  roomId: string | null,
): UsePinnedMessagesReturn => {
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef<string | null>(null);

  const fetchPinned = useCallback(async () => {
    if (!roomId) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await messageApi.getPinnedMessages(roomId);
      if (response.success) {
        const data = response.data as { messages: Message[] };
        setPinnedMessages(data.messages ?? []);
      }
    } catch (err) {
      const apiErr = extractApiError(err);
      setError(apiErr.message);
    } finally {
      setIsLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    if (roomId && roomId !== fetchedRef.current) {
      fetchedRef.current = roomId;
      fetchPinned();
    }
  }, [roomId, fetchPinned]);

  const togglePin = useCallback(
    async (message: Message): Promise<boolean> => {
      if (!roomId) return false;

      const isPinned = message.isPinned ?? false;

      // Optimistic update
      if (isPinned) {
        setPinnedMessages((prev) => prev.filter((m) => m.id !== message.id));
      } else {
        setPinnedMessages((prev) => [message, ...prev]);
      }

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
          setPinnedMessages((prev) => [message, ...prev]);
        } else {
          setPinnedMessages((prev) => prev.filter((m) => m.id !== message.id));
        }
        const apiErr = extractApiError(err);
        setError(apiErr.message);
        return false;
      }
    },
    [roomId],
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
