import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authGet: vi.fn(),
  refreshAccessToken: vi.fn(),
  runClientLogoutCleanup: vi.fn(),
}));

vi.mock("../lib/axios", () => ({
  default: { put: vi.fn() },
  authenticatedAuthClient: { get: mocks.authGet },
  resetAuthFailureState: vi.fn(),
  setAuthFailureHandler: vi.fn(),
}));

vi.mock("../services/tokenService", () => ({
  getAccessToken: () => null,
  getRefreshToken: () => "refresh-token",
  isAuthSessionActive: () => false,
  isRefreshTokenCookieMode: () => false,
  parseMustChangePasswordFromToken: () => false,
  storeTokens: vi.fn(),
}));

vi.mock("../services/authRefreshCoordinator", () => ({
  refreshAccessTokenShared: mocks.refreshAccessToken,
}));

vi.mock("../services/authService", () => ({
  initializeAuthSync: vi.fn(),
  notifyLogoutAcrossTabs: vi.fn(),
  redirectToLogin: vi.fn(),
  requestServerLogout: vi.fn(),
  runClientLogoutCleanup: mocks.runClientLogoutCleanup,
}));

vi.mock("../services/authIdentityGuard", () => ({
  compareIdentity: vi.fn(() => ({ mismatch: false })),
  reportAuthIdentityMismatch: vi.fn(),
  resetAuthIdentityGuard: vi.fn(),
  setAuthIdentityMismatchHandler: vi.fn(),
}));

vi.mock("../services/api", () => ({
  userApi: { getProfile: vi.fn() },
  authApi: { register: vi.fn() },
}));

vi.mock("../features/auth/api/authApi", () => ({
  loginAuthApi: vi.fn(),
  normalizeAuthResponse: vi.fn((value) => value),
}));

vi.mock("../components/ui", () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe("authStore reload bootstrap authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    localStorage.clear();
    mocks.refreshAccessToken.mockResolvedValue("fresh-access-token");
    mocks.authGet.mockRejectedValue(new Error("temporary auth outage"));
  });

  it("never authenticates a persisted user when canonical /me is temporarily unavailable", async () => {
    localStorage.setItem(
      "auth-storage",
      JSON.stringify({
        state: {
          user: {
            id: "system-super-admin",
            username: "system",
            role: "super_admin",
          },
          authStatus: "authenticated",
          isAuthenticated: true,
        },
        version: 0,
      }),
    );

    const { useAuthStore } = await import("./authStore");

    expect(useAuthStore.getState().user).toBeNull();

    useAuthStore.setState({
      user: {
        id: "system-super-admin",
        username: "system",
        role: "super_admin",
      },
      authStatus: "authenticated",
      isAuthenticated: true,
      isInitialized: false,
    });

    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      authStatus: "bootstrap_error",
      isAuthenticated: false,
      isInitialized: true,
    });
    expect(mocks.runClientLogoutCleanup).not.toHaveBeenCalled();
  });
});
