import React from "react";
import { useTranslation } from "react-i18next";
import type { Conversation, SendRestriction } from "../types";
import type { ConnectionState } from "./useWebSocket";

export type ComposerMode =
  | "bootstrapping"
  | "online"
  | "reconnecting"
  | "offline"
  | "slow_mode"
  | "restricted";

export interface ComposerAvailability {
  mode: ComposerMode;
  canType: boolean;
  canAttach: boolean;
  canSubmit: boolean;
  statusMessage?: string;
  statusTone: "info" | "warn" | "error";
}

interface UseComposerAvailabilityOptions {
  connectionState: ConnectionState;
  conversation: Conversation;
  isConversationReady?: boolean;
  sendRestriction?: SendRestriction;
  slowModeRemainingSeconds?: number;
}

const getBrowserOnlineState = (): boolean => {
  if (
    typeof navigator === "undefined" ||
    typeof navigator.onLine !== "boolean"
  ) {
    return true;
  }

  return navigator.onLine;
};

export const useComposerAvailability = ({
  connectionState,
  conversation,
  isConversationReady = true,
  sendRestriction,
  slowModeRemainingSeconds = 0,
}: UseComposerAvailabilityOptions): ComposerAvailability => {
  const { t } = useTranslation();

  return React.useMemo(() => {
    const browserOnline = getBrowserOnlineState();
    const websocketReady = connectionState === "connected";

    if (!isConversationReady) {
      return {
        mode: "bootstrapping",
        canType: false,
        canAttach: false,
        canSubmit: false,
        statusTone: "info",
        statusMessage: t("common:loading.default", {
          defaultValue: "Loading conversation...",
        }),
      };
    }

    if (conversation.isBlocked) {
      return {
        mode: "restricted" as const,
        canType: false,
        canAttach: false,
        canSubmit: false,
        statusTone: "error" as const,
        statusMessage: t("chat:composer.blockedConversation", {
          defaultValue: "You cannot send messages in this conversation.",
        }),
      };
    }

    if (conversation.canCurrentUserSend === false) {
      return {
        mode: "restricted",
        canType: false,
        canAttach: false,
        canSubmit: false,
        statusTone: "warn",
        statusMessage: t("chat:composer.readonlyGroup", {
          defaultValue: "Only group admins can send messages right now.",
        }),
      };
    }

    if (sendRestriction) {
      const isSlowModeRestriction = sendRestriction.kind === "slow_mode";
      return {
        mode: isSlowModeRestriction ? "slow_mode" : "restricted",
        canType: isSlowModeRestriction,
        canAttach: isSlowModeRestriction,
        canSubmit: false,
        statusTone: isSlowModeRestriction ? "warn" : "error",
        statusMessage: sendRestriction.reason,
      };
    }

    if (slowModeRemainingSeconds > 0) {
      return {
        mode: "slow_mode",
        canType: true,
        canAttach: true,
        canSubmit: false,
        statusTone: "warn",
        statusMessage: t("chat:slowMode.active", {
          defaultValue: "Slow mode active. Try again in {{seconds}}s.",
          seconds: slowModeRemainingSeconds,
        }),
      };
    }

    if (!browserOnline) {
      return {
        mode: "offline",
        canType: true,
        canAttach: false,
        canSubmit: true,
        statusTone: "error",
        statusMessage: t("chat:composer.offlineHint", {
          defaultValue: "Offline. Messages may fail and can be retried.",
        }),
      };
    }

    if (!websocketReady) {
      return {
        mode: "reconnecting",
        canType: true,
        canAttach: true,
        canSubmit: true,
        statusTone: "warn",
        statusMessage: t("chat:composer.reconnectingHint", {
          defaultValue:
            "Reconnecting. You can keep sending while messages are being confirmed.",
        }),
      };
    }

    return {
      mode: "online",
      canType: true,
      canAttach: true,
      canSubmit: true,
      statusTone: "info",
      statusMessage: undefined,
    };
  }, [
    connectionState,
    conversation.isBlocked,
    conversation.canCurrentUserSend,
    isConversationReady,
    sendRestriction,
    slowModeRemainingSeconds,
    t,
  ]);
};

export default useComposerAvailability;
