import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "../../../components/ui";
import { extractApiError, unwrapApiSuccess } from "../../../lib/apiContract";
import { getConversationByIdUseCase } from "../usecases/getConversationById";
import { logMessageDebug } from "../../../utils/messageDebug";
import { useChatStore, useHasConversation } from "../../../stores";
import type { Conversation } from "../../../types";

export interface ConversationValidationError {
  conversationId: string;
  message: string;
}

interface UseConversationValidationOptions {
  routeConversationId: string | null;
  addConversation: (conversation: Conversation) => void;
  updateConversation: (id: string, updates: Partial<Conversation>) => void;
  conversationAccessDeniedMessage: string;
  conversationOpenFailedMessage: string;
  shouldTraceRenderLoop?: boolean;
}

interface UseConversationValidationResult {
  isValidatingRoom: boolean;
  lastValidatedConversationId: string | null;
  conversationValidationError: ConversationValidationError | null;
  handleRetryConversationValidation: () => void;
}

export const useConversationValidation = ({
  routeConversationId,
  addConversation,
  updateConversation,
  conversationAccessDeniedMessage,
  conversationOpenFailedMessage,
  shouldTraceRenderLoop = false,
}: UseConversationValidationOptions): UseConversationValidationResult => {
  const navigate = useNavigate();
  const hasConversationCachedForRoute = useHasConversation(routeConversationId);
  const [isValidatingRoom, setIsValidatingRoom] = useState(false);
  const [lastValidatedConversationId, setLastValidatedConversationId] =
    useState<string | null>(null);
  const [conversationValidationError, setConversationValidationError] =
    useState<ConversationValidationError | null>(null);
  const [validationRetryToken, setValidationRetryToken] = useState(0);
  const validatingConversationIdRef = useRef<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    if (!routeConversationId) {
      validatingConversationIdRef.current = null;
      setLastValidatedConversationId((previous) =>
        previous === null ? previous : null,
      );
      setConversationValidationError(null);
      setIsValidatingRoom(false);
      return;
    }

    if (
      lastValidatedConversationId === routeConversationId &&
      hasConversationCachedForRoute
    ) {
      if (shouldTraceRenderLoop) {
        logMessageDebug("ChatPage", "conversation_validation_skipped_cached", {
          conversationId: routeConversationId,
        });
      }
      return;
    }

    if (validatingConversationIdRef.current === routeConversationId) {
      if (shouldTraceRenderLoop) {
        logMessageDebug(
          "ChatPage",
          "conversation_validation_skipped_in_flight",
          {
            conversationId: routeConversationId,
          },
        );
      }
      return;
    }

    validatingConversationIdRef.current = routeConversationId;

    const validateConversation = async () => {
      setIsValidatingRoom(true);
      setConversationValidationError((previous) =>
        previous?.conversationId === routeConversationId ? null : previous,
      );
      if (shouldTraceRenderLoop) {
        logMessageDebug("ChatPage", "conversation_validation_requested", {
          conversationId: routeConversationId,
        });
      }

      try {
        const response = await getConversationByIdUseCase(routeConversationId);
        const room = unwrapApiSuccess(response);
        if (isCancelled) return;
        const existing =
          useChatStore.getState().conversationById[routeConversationId] ?? null;

        const shouldUpdateExistingRoom = Boolean(
          existing &&
            (existing.updatedAt !== room.updatedAt ||
              existing.unreadCount !== room.unreadCount ||
              existing.lastMessage?.id !== room.lastMessage?.id ||
              existing.displayName !== room.displayName ||
              existing.name !== room.name ||
              existing.avatar !== room.avatar ||
              existing.participants?.length !== room.participants?.length),
        );

        if (!existing) {
          addConversation(room);
        } else if (shouldUpdateExistingRoom) {
          updateConversation(routeConversationId, room);
        }

        setLastValidatedConversationId((previous) =>
          previous === routeConversationId ? previous : routeConversationId,
        );
        setConversationValidationError(null);
        if (shouldTraceRenderLoop) {
          logMessageDebug("ChatPage", "conversation_validation_succeeded", {
            conversationId: routeConversationId,
            roomInserted: !existing,
            roomUpdated: shouldUpdateExistingRoom,
          });
        }
      } catch (error: unknown) {
        if (isCancelled) return;

        const apiError = extractApiError(error);
        const code = String(apiError.code || "").toUpperCase();
        const roomInvalidCodes = new Set([
          "NOT_FOUND",
          "ROOM_NOT_FOUND",
          "FORBIDDEN",
          "ROOM_ACCESS_DENIED",
        ]);

        if (roomInvalidCodes.has(code)) {
          setConversationValidationError(null);
          toast.error(conversationAccessDeniedMessage);
          navigate("/chat", { replace: true });
        } else {
          const message = apiError.message || conversationOpenFailedMessage;
          setConversationValidationError({
            conversationId: routeConversationId,
            message,
          });
          toast.error(message);
        }

        setLastValidatedConversationId((previous) =>
          previous === null ? previous : null,
        );
        if (shouldTraceRenderLoop) {
          logMessageDebug("ChatPage", "conversation_validation_failed", {
            conversationId: routeConversationId,
            code,
            message: apiError.message,
          });
        }
      } finally {
        if (
          !isCancelled &&
          validatingConversationIdRef.current === routeConversationId
        ) {
          validatingConversationIdRef.current = null;
          setIsValidatingRoom(false);
        }
      }
    };

    void validateConversation();

    return () => {
      isCancelled = true;
    };
  }, [
    addConversation,
    conversationAccessDeniedMessage,
    conversationOpenFailedMessage,
    hasConversationCachedForRoute,
    lastValidatedConversationId,
    navigate,
    routeConversationId,
    shouldTraceRenderLoop,
    updateConversation,
    validationRetryToken,
  ]);

  const handleRetryConversationValidation = useCallback(() => {
    if (!routeConversationId) {
      return;
    }

    setConversationValidationError(null);
    setLastValidatedConversationId(null);
    setValidationRetryToken((current) => current + 1);
  }, [routeConversationId]);

  return {
    isValidatingRoom,
    lastValidatedConversationId,
    conversationValidationError,
    handleRetryConversationValidation,
  };
};

export default useConversationValidation;
