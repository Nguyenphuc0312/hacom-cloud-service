import { describe, expect, it, vi } from "vitest";
import {
  createWebSocketAuthCoordinator,
  createWebSocketAuthCoordinatorState,
  resolveAuthRecoveryMode,
} from "./useWebSocketAuthCoordinator";

const createCoordinator = () => {
  let listener: ((event: { type: string }) => void) | null = null;

  const deps = {
    onError: vi.fn(),
    notifySessionExpired: vi.fn(),
    handleAuthFailure: vi.fn(async () => {}),
    resetAuthFailureState: vi.fn(),
    refreshAccessTokenShared: vi.fn(async () => "fresh-token"),
    getAccessToken: vi.fn(() => "current-token"),
    isTokenExpiringSoon: vi.fn(() => false),
    authenticateSocket: vi.fn(),
    updateSocketAuth: vi.fn(),
    subscribeToAuthRefreshEvents: vi.fn((callback) => {
      listener = callback;
      return vi.fn();
    }),
  };

  const coordinator = createWebSocketAuthCoordinator({
    state: createWebSocketAuthCoordinatorState(),
    tokenRefreshThreshold: 60_000,
    ...deps,
  });

  return {
    coordinator,
    deps,
    emitRefreshEvent: (event: { type: string }) => {
      if (listener) {
        listener(event);
      }
    },
  };
};

describe("useWebSocketAuthCoordinator", () => {
  it("reauth uses authenticateSocket when the current token is still fresh", async () => {
    const { coordinator, deps } = createCoordinator();

    await coordinator.recoverSocketAuth(
      "ws_reauth_required",
      "authenticate_required",
      "reauth",
    );

    expect(deps.getAccessToken).toHaveBeenCalled();
    expect(deps.authenticateSocket).toHaveBeenCalledWith("current-token");
    expect(deps.refreshAccessTokenShared).not.toHaveBeenCalled();
    expect(deps.updateSocketAuth).not.toHaveBeenCalled();
  });

  it("reauth refreshes when the current token is expiring", async () => {
    const { coordinator, deps } = createCoordinator();
    deps.isTokenExpiringSoon.mockReturnValue(true);

    await coordinator.recoverSocketAuth(
      "ws_reauth_required",
      "token_expiring",
      "reauth",
    );

    expect(deps.refreshAccessTokenShared).toHaveBeenCalledWith(
      "ws_reauth_required",
    );
    expect(deps.updateSocketAuth).toHaveBeenCalledWith("fresh-token");
    expect(deps.authenticateSocket).not.toHaveBeenCalled();
  });

  it("reconnect always refreshes and updates socket auth", async () => {
    const { coordinator, deps } = createCoordinator();

    await coordinator.recoverSocketAuth("ws_close_4401", "close_4401");

    expect(deps.refreshAccessTokenShared).toHaveBeenCalledWith("ws_close_4401");
    expect(deps.updateSocketAuth).toHaveBeenCalledWith("fresh-token");
    expect(deps.authenticateSocket).not.toHaveBeenCalled();
  });

  it("dedupes concurrent recovery requests through a shared promise", async () => {
    const { coordinator, deps } = createCoordinator();
    const resolveRefreshRef: { current: ((value: string) => void) | null } = {
      current: null,
    };
    deps.refreshAccessTokenShared.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveRefreshRef.current = resolve;
        }),
    );

    const first = coordinator.recoverSocketAuth("ws_close_4401", "close_4401");
    const second = coordinator.recoverSocketAuth("ws_close_4401", "close_4401");

    expect(deps.refreshAccessTokenShared).toHaveBeenCalledTimes(1);

    if (resolveRefreshRef.current) {
      resolveRefreshRef.current("fresh-token");
    }
    await Promise.all([first, second]);

    expect(deps.updateSocketAuth).toHaveBeenCalledTimes(1);
  });

  it("handles refresh failure once per incident and resets after token refresh", async () => {
    const { coordinator, deps, emitRefreshEvent } = createCoordinator();
    deps.refreshAccessTokenShared.mockRejectedValue(new Error("boom"));

    await coordinator.recoverSocketAuth("ws_close_4401", "close_4401");
    await coordinator.recoverSocketAuth("ws_close_4401", "close_4401");

    expect(deps.notifySessionExpired).toHaveBeenCalledTimes(1);
    expect(deps.handleAuthFailure).toHaveBeenCalledTimes(1);

    const unsubscribe = coordinator.subscribeToRefreshEvents();
    expect(deps.subscribeToAuthRefreshEvents).toHaveBeenCalledTimes(1);
    emitRefreshEvent({ type: "token_refreshed" });

    await coordinator.recoverSocketAuth("ws_close_4401", "close_4401");

    expect(deps.notifySessionExpired).toHaveBeenCalledTimes(2);
    expect(deps.handleAuthFailure).toHaveBeenCalledTimes(2);
    expect(deps.resetAuthFailureState).toHaveBeenCalled();
    expect(unsubscribe).toBeTypeOf("function");
  });

  it("routes unauthorized and reauth-required events to the expected recovery modes", async () => {
    const { coordinator, deps } = createCoordinator();

    await coordinator.handleUnauthorizedEvent({
      code: "AUTH_UNAUTHORIZED",
      message: "denied",
    });
    await coordinator.handleReauthRequiredEvent({
      reason: "authenticate_required",
    });

    expect(deps.onError).toHaveBeenCalledWith(new Error("denied"));
    expect(deps.authenticateSocket).toHaveBeenCalledWith("current-token");
  });

  it("maps authenticate_required to reauth and other reasons to reconnect", () => {
    expect(resolveAuthRecoveryMode("authenticate_required")).toBe("reauth");
    expect(resolveAuthRecoveryMode("token_expiring")).toBe("reconnect");
  });
});
