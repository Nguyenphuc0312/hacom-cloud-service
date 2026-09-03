import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authGet: vi.fn(),
  refreshAccessToken: vi.fn(),
  runClientLogoutCleanup: vi.fn(),
  runCurrentTabIdentityMismatchCleanup: vi.fn(),
  validateBoundAuthSessionIdentity: vi.fn(),
  bindAuthSessionIdentity: vi.fn(),
  getAccessToken: vi.fn(),
}));

vi.mock("../lib/axios", () => ({
  default: { put: vi.fn() },
  authenticatedAuthClient: { get: mocks.authGet },
  resetAuthFailureState: vi.fn(),
  setAuthFailureHandler: vi.fn(),
}));

vi.mock("../services/tokenService", () => ({
  getAccessToken: mocks.getAccessToken,
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
  runCurrentTabIdentityMismatchCleanup:
    mocks.runCurrentTabIdentityMismatchCleanup,
}));

vi.mock("../services/authIdentityGuard", () => ({
  bindAuthSessionIdentity: mocks.bindAuthSessionIdentity,
  compareIdentity: vi.fn(() => ({ mismatch: false })),
  reportAuthIdentityMismatch: vi.fn(),
  resetAuthIdentityGuard: vi.fn(),
  setAuthIdentityMismatchHandler: vi.fn(),
  validateBoundAuthSessionIdentity: mocks.validateBoundAuthSessionIdentity,
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
    mocks.validateBoundAuthSessionIdentity.mockReturnValue("match");
    mocks.bindAuthSessionIdentity.mockReturnValue(true);
    mocks.getAccessToken.mockReturnValue(null);
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

  it("rejects a refreshed Admin principal when it differs from the account that established the browser session", async () => {
    mocks.authGet.mockResolvedValue({
      data: {
        success: true,
        data: {
          id: "system-super-admin",
          username: "system",
          role: "super_admin",
        },
      },
    });
    mocks.validateBoundAuthSessionIdentity.mockReturnValue("mismatch");

    const { useAuthStore } = await import("./authStore");
    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      authStatus: "anonymous",
      isAuthenticated: false,
      isInitialized: true,
    });
    expect(mocks.runCurrentTabIdentityMismatchCleanup).toHaveBeenCalledWith(
      "bootstrap_refresh_identity_mismatch",
    );
  });

  it("still restores the canonical user when the refreshed principal matches", async () => {
    mocks.authGet.mockResolvedValue({
      data: {
        success: true,
        data: { id: "employee-a", username: "HC000001" },
      },
    });

    const { useAuthStore } = await import("./authStore");
    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState()).toMatchObject({
      user: { id: "employee-a", username: "HC000001" },
      authStatus: "authenticated",
      isAuthenticated: true,
      isInitialized: true,
    });
    expect(mocks.runClientLogoutCleanup).not.toHaveBeenCalled();
    expect(mocks.runCurrentTabIdentityMismatchCleanup).not.toHaveBeenCalled();
  });

  it("binds the canonical principal after a required password change", async () => {
    mocks.getAccessToken.mockReturnValue("password-change-access-token");
    mocks.authGet.mockResolvedValue({
      data: {
        success: true,
        data: { id: "employee-a", username: "HC000001" },
      },
    });

    const { useAuthStore } = await import("./authStore");
    useAuthStore.setState({
      authStatus: "password_change_required",
      passwordChangeContinuation: "continuation",
      isAuthenticated: false,
    });

    await useAuthStore.getState().refreshUser();

    expect(mocks.bindAuthSessionIdentity).toHaveBeenCalledWith(
      "password-change-access-token",
      expect.objectContaining({ id: "employee-a" }),
    );
    expect(useAuthStore.getState()).toMatchObject({
      authStatus: "authenticated",
      isAuthenticated: true,
      user: { id: "employee-a" },
    });
  });
});
