import React from "react";
import { useTranslation } from "react-i18next";
import type { Conversation, SendRestriction } from "../types";
import type { ConnectionState } from "./useWebSocket";

export type ComposerMode =
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
  sendRestriction?: SendRestriction;
  slowModeRemainingSeconds?: number;
}

export const useComposerAvailability = ({
  connectionState,
  conversation,
  sendRestriction,
  slowModeRemainingSeconds = 0,
}: UseComposerAvailabilityOptions): ComposerAvailability => {
  const { t } = useTranslation();

  return React.useMemo(() => {
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

    if (
      connectionState === "connecting" ||
      connectionState === "authenticating" ||
      connectionState === "reconnecting"
    ) {
      return {
        mode: "reconnecting",
        canType: true,
        canAttach: false,
        canSubmit: true,
        statusTone: "warn",
        statusMessage: t("chat:composer.reconnectingHint", {
          defaultValue: "Reconnecting. New messages will be queued.",
        }),
      };
    }

    if (connectionState === "disconnected" || connectionState === "error") {
      return {
        mode: "offline",
        canType: true,
        canAttach: false,
        canSubmit: true,
        statusTone: "error",
        statusMessage: t("chat:composer.offlineHint", {
          defaultValue: "Offline. Messages will send automatically when connection returns.",
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
    sendRestriction,
    slowModeRemainingSeconds,
    t,
  ]);
};

export default useComposerAvailability;
