import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression: a rename saved in "Chỉnh sửa hồ sơ" survived the PATCH but was
 * lost on the next `/auth/me`.
 *
 * `displayName` lives in chat-api (`public.user_profiles.display_name`). The
 * public `/auth/me` contract deliberately strips `displayName` and exposes HR
 * only under `hrProfile` (chat-auth-service `toPublicCurrentAuthUser`), so the
 * self-chosen name is unreachable from auth alone. `fetchCurrentUser` must
 * backfill it from `GET /users/profile`, otherwise `refreshProfile()` — which
 * ProfileEditDialog calls right after saving — replaces the store's `user` and
 * the name snaps back to the HR legal name.
 */

const mocks = vi.hoisted(() => ({
  authGet: vi.fn(),
  getProfile: vi.fn(),
}));

vi.mock("../lib/axios", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn() },
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn() },
  authClient: { get: vi.fn(), post: vi.fn() },
  authenticatedAuthClient: { get: mocks.authGet, post: vi.fn() },
  setAuthFailureHandler: vi.fn(),
}));

vi.mock("../services/api", () => ({
  userApi: { getProfile: mocks.getProfile },
}));

vi.mock("../services/tokenService", () => ({
  getAccessToken: () => "token",
  setTokens: vi.fn(),
  clearTokens: vi.fn(),
  parseMustChangePasswordFromToken: () => false,
  getRefreshToken: () => "refresh",
  hasStoredSession: () => true,
}));

vi.mock("../components/ui", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const HR_ONLY_ME = {
  data: {
    success: true,
    data: {
      id: "u1",
      username: "HC987658",
      // No `displayName` — this is exactly what /auth/me returns.
      hrProfile: { employeeCode: "HC987658", fullName: "Kevin" },
    },
  },
};

describe("authStore.refreshProfile — self displayName", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("backfills the self-chosen displayName from chat-api", async () => {
    mocks.authGet.mockResolvedValue(HR_ONLY_ME);
    mocks.getProfile.mockResolvedValue({
      success: true,
      data: { displayName: "Kevin QA 2", avatar: null },
    });

    const { useAuthStore } = await import("./authStore");
    const user = await useAuthStore.getState().refreshProfile();

    expect(user?.displayName).toBe("Kevin QA 2");
    expect(user?.fullNameFromHr).toBe("Kevin");
  });

  it("falls back to the HR name when chat-api has no displayName", async () => {
    mocks.authGet.mockResolvedValue(HR_ONLY_ME);
    mocks.getProfile.mockResolvedValue({
      success: true,
      data: { displayName: null, avatar: null },
    });

    const { useAuthStore } = await import("./authStore");
    const user = await useAuthStore.getState().refreshProfile();

    expect(user?.displayName).toBe("Kevin");
  });

  it("still resolves a user when the chat-api profile read fails", async () => {
    mocks.authGet.mockResolvedValue(HR_ONLY_ME);
    mocks.getProfile.mockRejectedValue(new Error("network"));

    const { useAuthStore } = await import("./authStore");
    const user = await useAuthStore.getState().refreshProfile();

    expect(user?.username).toBe("HC987658");
    expect(user?.displayName).toBe("Kevin");
  });
});
