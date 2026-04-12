import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ErrorCode } from "@hacom/chat-shared-types";
import { useChatStore, useGroupStore } from "../../../stores";
import { extractApiError } from "../../../lib/apiContract";
import { logMessageDebug } from "../../../utils/messageDebug";
import type { Attachment, Message } from "../../../types";
import { MessageType } from "../../../types";

interface UseSendMessageOptions {
  selectedConversationId: string | null;
  hasSelectedConversation: boolean;
  isCurrentRouteValidated: boolean;
  isValidatingRoom: boolean;
  source?: string;
}

export const useSendMessage = ({
  selectedConversationId,
  hasSelectedConversation,
  isCurrentRouteValidated,
  isValidatingRoom,
  source = "ChatPage",
}: UseSendMessageOptions) => {
  const { t } = useTranslation();
  const setSlowModeCooldown = useGroupStore(
    (state) => state.setSlowModeCooldown,
  );
  const storeSendMessage = useChatStore((state) => state.sendMessage);

  return useCallback(
    async (
      content: string,
      replyTo?: Message,
      fileMeta?: Attachment | Attachment[] | undefined,
      type: MessageType = MessageType.TEXT,
    ) => {
      if (!selectedConversationId) {
        const error = new Error(
          t("error:chat.conversationOpenFailed", {
            defaultValue: "Conversation is not ready yet.",
          }),
        );
        logMessageDebug(source, "send_blocked_no_selected_conversation", {
          contentLength: content.trim().length,
          type,
        });
        throw error;
      }

      const canSendImmediately = Boolean(
        selectedConversationId &&
        hasSelectedConversation &&
        isCurrentRouteValidated &&
        !isValidatingRoom,
      );

      if (!canSendImmediately) {
        const error = new Error(
          t("common:loading.default", {
            defaultValue: "Loading conversation...",
          }),
        );
        logMessageDebug(source, "send_blocked_conversation_not_ready", {
          conversationId: selectedConversationId,
          isCurrentRouteValidated,
          hasSelectedConversation,
          isHistoryHydrated:
            useChatStore.getState().messagesHydratedByConversation[
              selectedConversationId
            ] === true,
          isValidatingRoom,
          contentLength: content.trim().length,
          type,
        });
        throw error;
      }

      try {
        return await storeSendMessage(
          selectedConversationId,
          content,
          type,
          fileMeta,
          replyTo?.id,
          replyTo,
        );
      } catch (error) {
        const apiError = extractApiError(error);
        const details =
          apiError.details && typeof apiError.details === "object"
            ? (apiError.details as Record<string, unknown>)
            : null;
        const retryAfterSeconds =
          details && typeof details.retryAfterSeconds === "number"
            ? details.retryAfterSeconds
            : null;

        if (
          (apiError.code === ErrorCode.SLOW_MODE_ACTIVE ||
            String(apiError.code).toUpperCase() === "SLOW_MODE_ACTIVE") &&
          retryAfterSeconds &&
          retryAfterSeconds > 0
        ) {
          setSlowModeCooldown(selectedConversationId, retryAfterSeconds);
        }

        throw error;
      }
    },
    [
      hasSelectedConversation,
      isCurrentRouteValidated,
      isValidatingRoom,
      selectedConversationId,
      setSlowModeCooldown,
      source,
      storeSendMessage,
      t,
    ],
  );
};
