import type {
  AuthRefreshEvent,
  AuthRefreshTrigger,
} from "../services/authRefreshCoordinator";
import {
  extractHttpStatus,
  isDefiniteAuthRefreshFailure,
  isTransientRefreshFailure,
} from "../services/authRefreshErrorClassifier";
import type { AuthFailureInput } from "../stores/authStore";
import { logger } from "../utils/logger";

export type WebSocketAuthRecoveryTrigger =
  | "ws_reauth_required"
  | "ws_unauthorized"
  | "ws_close_4401";

export type WebSocketAuthRecoveryMode = "reauth" | "reconnect";

type WebSocketAuthCoordinatorState = {
  recoveryPromise: Promise<void> | null;
  failureHandled: boolean;
};

type CreateWebSocketAuthCoordinatorOptions = {
  state: WebSocketAuthCoordinatorState;
  tokenRefreshThreshold: number;
  onError?: (error: Error) => void;
  notifySessionExpired: () => void;
  handleAuthFailure: (input?: AuthFailureInput) => Promise<void>;
  resetAuthFailureState: () => void;
  refreshAccessTokenShared: (trigger: AuthRefreshTrigger) => Promise<string>;
  getAccessToken: () => string | null;
  isTokenExpiringSoon: (token: string, minValidityMs: number) => boolean;
  authenticateSocket: (accessToken: string) => void;
  updateSocketAuth: (accessToken: string) => void;
  subscribeToAuthRefreshEvents: (
    listener: (event: AuthRefreshEvent) => void,
  ) => () => void;
};

type UnauthorizedEventInput = {
  code?: string | null;
  message?: string | null;
};

type ReauthRequiredEventInput = {
  reason?: string | null;
};

export const createWebSocketAuthCoordinatorState =
  (): WebSocketAuthCoordinatorState => ({
    recoveryPromise: null,
    failureHandled: false,
  });

export const resolveAuthRecoveryMode = (
  reason: string | null | undefined,
): WebSocketAuthRecoveryMode =>
  reason === "authenticate_required" ? "reauth" : "reconnect";

export const createWebSocketAuthCoordinator = ({
  state,
  tokenRefreshThreshold,
  onError,
  notifySessionExpired,
  handleAuthFailure,
  resetAuthFailureState,
  refreshAccessTokenShared,
  getAccessToken,
  isTokenExpiringSoon,
  authenticateSocket,
  updateSocketAuth,
  subscribeToAuthRefreshEvents,
}: CreateWebSocketAuthCoordinatorOptions) => {
  const handleAuthRefreshEvent = (event: AuthRefreshEvent): void => {
    if (event.type !== "token_refreshed") {
      return;
    }

    state.failureHandled = false;
    resetAuthFailureState();
  };

  const subscribeToRefreshEvents = (): (() => void) =>
    subscribeToAuthRefreshEvents((event) => {
      handleAuthRefreshEvent(event);
    });

  const handleWsRefreshFailure = async (
    reason: string,
    error: unknown,
  ): Promise<void> => {
    const message = error instanceof Error ? error.message : "refresh_failed";

    // Transient failures (network/timeout/429/5xx) must NOT log the user out.
    // The WebSocket reconnect scheduler/backoff will retry; the session is
    // still valid. This mirrors the HTTP interceptor's behavior.
    if (!isDefiniteAuthRefreshFailure(error)) {
      logger.warn("ws-auth", "recovery_failed_transient_keep_session", {
        reason,
        status: extractHttpStatus(error),
        transient: isTransientRefreshFailure(error),
      });
      onError?.(
        new Error(`WebSocket auth recovery transient failure (${reason}): ${message}`),
      );
      return;
    }

    if (!state.failureHandled) {
      state.failureHandled = true;
      logger.warn("ws-auth", "recovery_failed_definitive_logout", { reason });
      notifySessionExpired();
      await handleAuthFailure({
        reason: "ws_refresh_definitive_auth_failure",
        broadcast: true,
        redirect: true,
        definitive: true,
      });
    }

    onError?.(
      new Error(`WebSocket auth recovery failed (${reason}): ${message}`),
    );
  };

  const recoverSocketAuth = async (
    trigger: WebSocketAuthRecoveryTrigger,
    reason: string,
    mode: WebSocketAuthRecoveryMode = "reconnect",
  ): Promise<void> => {
    if (!state.recoveryPromise) {
      state.recoveryPromise = (async () => {
        try {
          if (mode === "reauth") {
            const currentAccessToken = getAccessToken();
            if (!currentAccessToken) {
              throw new Error("Missing access token");
            }

            if (
              isTokenExpiringSoon(currentAccessToken, tokenRefreshThreshold)
            ) {
              const accessToken = await refreshAccessTokenShared(trigger);
              updateSocketAuth(accessToken);
            } else {
              authenticateSocket(currentAccessToken);
            }
          } else {
            const accessToken = await refreshAccessTokenShared(trigger);
            updateSocketAuth(accessToken);
          }

          resetAuthFailureState();
          state.failureHandled = false;
        } catch (error) {
          await handleWsRefreshFailure(reason, error);
        }
      })().finally(() => {
        state.recoveryPromise = null;
      });
    }

    return state.recoveryPromise;
  };

  const handleConnectFailure = async (error: unknown): Promise<void> =>
    handleWsRefreshFailure("ws_connect", error);

  const handleUnauthorizedEvent = (
    input?: UnauthorizedEventInput,
  ): Promise<void> => {
    const code = input?.code ?? "AUTH_UNAUTHORIZED";
    const message = input?.message ?? "WebSocket unauthorized";
    onError?.(new Error(message));
    return recoverSocketAuth("ws_unauthorized", code);
  };

  const handleReauthRequiredEvent = (
    input?: ReauthRequiredEventInput,
  ): Promise<void> => {
    const reason = input?.reason ?? "reauthentication required";
    return recoverSocketAuth(
      "ws_reauth_required",
      reason,
      resolveAuthRecoveryMode(reason),
    );
  };

  return {
    subscribeToRefreshEvents,
    handleAuthRefreshEvent,
    handleWsRefreshFailure,
    recoverSocketAuth,
    handleConnectFailure,
    handleUnauthorizedEvent,
    handleReauthRequiredEvent,
  };
};
