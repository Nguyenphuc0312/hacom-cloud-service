import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  apiClientMock,
  authClientMock,
  authenticatedAuthClientMock,
  getCsrfTokenMock,
  isRefreshTokenCookieModeMock,
  isRememberMeEnabledMock,
  storeTokensMock,
  updateAccessTokenMock,
} = vi.hoisted(() => ({
  apiClientMock: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    request: vi.fn(),
  },
  authClientMock: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    request: vi.fn(),
  },
  authenticatedAuthClientMock: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    request: vi.fn(),
  },
  getCsrfTokenMock: vi.fn(),
  isRefreshTokenCookieModeMock: vi.fn(),
  isRememberMeEnabledMock: vi.fn(),
  storeTokensMock: vi.fn(),
  updateAccessTokenMock: vi.fn(),
}));

vi.mock("../lib/axios", () => ({
  default: apiClientMock,
  authClient: authClientMock,
  authenticatedAuthClient: authenticatedAuthClientMock,
}));

vi.mock("./tokenService", () => ({
  getCsrfToken: getCsrfTokenMock,
  isRefreshTokenCookieMode: isRefreshTokenCookieModeMock,
  isRememberMeEnabled: isRememberMeEnabledMock,
  storeTokens: storeTokensMock,
  updateAccessToken: updateAccessTokenMock,
}));

import { authApi } from "./api";

describe("authApi.changePassword", () => {
  beforeEach(() => {
    authenticatedAuthClientMock.post.mockReset();
    authClientMock.post.mockReset();
    isRefreshTokenCookieModeMock.mockReset();
    isRememberMeEnabledMock.mockReset();
    storeTokensMock.mockReset();
    updateAccessTokenMock.mockReset();
    getCsrfTokenMock.mockReset();

    isRefreshTokenCookieModeMock.mockReturnValue(false);
    isRememberMeEnabledMock.mockReturnValue(false);
    getCsrfTokenMock.mockReturnValue(null);
  });

  it("uses the authenticated auth client and persists rotated tokens in body mode", async () => {
    authenticatedAuthClientMock.post.mockResolvedValue({
      data: {
        success: true,
        statusCode: 200,
        message: "Đổi mật khẩu thành công",
        data: {
          accessToken: "next-access-token",
          refreshToken: "next-refresh-token",
          mustChangePassword: false,
          nextAction: "CONTINUE",
        },
      },
    });

    await authApi.changePassword({
      currentPassword: "CurrentPass123",
      newPassword: "NewPass123",
      confirmPassword: "NewPass123",
    });

    expect(authenticatedAuthClientMock.post).toHaveBeenCalledWith(
      "/change-password",
      {
        currentPassword: "CurrentPass123",
        newPassword: "NewPass123",
        confirmPassword: "NewPass123",
      },
    );
    expect(authClientMock.post).not.toHaveBeenCalled();
    expect(storeTokensMock).toHaveBeenCalledWith(
      "next-access-token",
      "next-refresh-token",
      false,
    );
    expect(updateAccessTokenMock).not.toHaveBeenCalled();
  });

  it("updates only the access token in cookie refresh mode", async () => {
    isRefreshTokenCookieModeMock.mockReturnValue(true);
    authenticatedAuthClientMock.post.mockResolvedValue({
      data: {
        success: true,
        statusCode: 200,
        message: "Đổi mật khẩu thành công",
        data: {
          accessToken: "next-access-token",
          mustChangePassword: false,
          nextAction: "CONTINUE",
        },
      },
    });

    await authApi.changePassword({
      currentPassword: "CurrentPass123",
      newPassword: "NewPass123",
      confirmPassword: "NewPass123",
    });

    expect(updateAccessTokenMock).toHaveBeenCalledWith("next-access-token");
    expect(storeTokensMock).not.toHaveBeenCalled();
  });
});
