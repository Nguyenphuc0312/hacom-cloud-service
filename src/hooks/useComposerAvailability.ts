import React from "react";
import { useTranslation } from "react-i18next";
import type { Conversation, SendRestriction } from "../types";
import type { ConnectionState } from "./useWebSocket";

export type ComposerMode =
  | "bootstrapping"
  | "online"
  | "reconnecting"
  | "offline"
  | "unauthenticated"
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
    const isWarmupState =
      connectionState === "connecting" || connectionState === "authenticating";
    const isReconnectState = connectionState === "reconnecting";
    const isAuthState =
      connectionState === "unauthenticated" ||
      connectionState === "auth_failed";
    const isTerminalConnectionLoss =
      connectionState === "disconnected" || connectionState === "error";

    if (!isConversationReady) {
      return {
        mode: "bootstrapping",
        canType: false,
        canAttach: false,
        canSubmit: false,
        statusTone: "info",
        statusMessage: undefined,
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
      const backendRestriction = conversation.sendRestriction;
      if (backendRestriction?.code === "FRIENDSHIP_REQUIRED") {
        return {
          mode: "restricted" as const,
          canType: false,
          canAttach: false,
          canSubmit: false,
          statusTone: "error" as const,
          statusMessage:
            backendRestriction.reason === "UNFRIENDED"
              ? t("chat:composer.unfriendedRestriction", {
                  defaultValue:
                    "You are no longer friends. Add this person as a friend again to continue messaging.",
                })
              : t("chat:composer.friendshipRequiredRestriction", {
                  defaultValue:
                    "You can only message friends. Send a friend request to start the conversation.",
                }),
        };
      }
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
        statusMessage: t("chat:composer.offlineQueuedHint", {
          defaultValue:
            "Offline. Messages will be sent once the connection is stable.",
        }),
      };
    }

    if (isAuthState) {
      return {
        mode: "unauthenticated",
        canType: true,
        canAttach: false,
        canSubmit: false,
        statusTone: "error",
        statusMessage: t("chat:composer.sessionInactiveHint", {
          defaultValue: "Your session is no longer active. Please sign in again.",
        }),
      };
    }

    if (isReconnectState) {
      return {
        mode: "reconnecting",
        canType: true,
        canAttach: true,
        canSubmit: true,
        statusTone: "warn",
        statusMessage: t("chat:composer.reconnectingHint", {
          defaultValue:
            "Reconnecting. Messages will be sent once the connection is stable.",
        }),
      };
    }

    if (isTerminalConnectionLoss) {
      return {
        mode: "offline",
        canType: true,
        canAttach: false,
        canSubmit: false,
        statusTone: "error",
        statusMessage: t("chat:composer.offlineHint", {
          defaultValue:
            "Connection lost. Please check your network or wait for the system to reconnect.",
        }),
      };
    }

    if (!websocketReady && !isWarmupState) {
      return {
        mode: "offline",
        canType: true,
        canAttach: false,
        canSubmit: false,
        statusTone: "error",
        statusMessage: t("chat:composer.offlineHint", {
          defaultValue:
            "Connection lost. Please check your network or wait for the system to reconnect.",
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
    conversation.sendRestriction,
    isConversationReady,
    sendRestriction,
    slowModeRemainingSeconds,
    t,
  ]);
};

export default useComposerAvailability;
