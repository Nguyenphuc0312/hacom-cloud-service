import { beforeEach, describe, expect, it, vi } from "vitest";

const importTokenService = async () => import("./tokenService");

describe("tokenService remember-me persistence", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("keeps access tokens in memory and persists refresh token in localStorage when rememberMe=true", async () => {
    const tokenService = await importTokenService();

    tokenService.storeTokens("access-1", "refresh-1", true);

    expect(tokenService.getAccessToken()).toBe("access-1");
    expect(localStorage.getItem("accessToken")).toBeNull();
    expect(sessionStorage.getItem("accessToken")).toBeNull();
    expect(localStorage.getItem("refreshToken")).toBe("refresh-1");
    expect(sessionStorage.getItem("refreshToken")).toBeNull();
    expect(localStorage.getItem("rememberMe")).toBe("true");
  });

  it("keeps non-remembered refresh token in sessionStorage only", async () => {
    const tokenService = await importTokenService();

    tokenService.storeTokens("access-2", "refresh-2", false);

    expect(tokenService.getAccessToken()).toBe("access-2");
    // Không tick "ghi nhớ" → đóng tab là mất phiên.
    expect(sessionStorage.getItem("refreshToken")).toBe("refresh-2");
    expect(localStorage.getItem("refreshToken")).toBeNull();
    expect(localStorage.getItem("rememberMe")).toBeNull();
    // Access token không bao giờ chạm storage — chỉ nằm trong bộ nhớ.
    expect(localStorage.getItem("accessToken")).toBeNull();
    expect(sessionStorage.getItem("accessToken")).toBeNull();
  });

  it("đổi lựa chọn ghi nhớ thì dọn storage cũ, không để token nằm lại hai nơi", async () => {
    const tokenService = await importTokenService();

    tokenService.storeTokens("access-1", "refresh-1", true);
    expect(localStorage.getItem("refreshToken")).toBe("refresh-1");

    // Đăng nhập lại, lần này KHÔNG tick ghi nhớ.
    tokenService.storeTokens("access-2", "refresh-2", false);
    expect(sessionStorage.getItem("refreshToken")).toBe("refresh-2");
    expect(localStorage.getItem("refreshToken")).toBeNull();

    // Và ngược lại.
    tokenService.storeTokens("access-3", "refresh-3", true);
    expect(localStorage.getItem("refreshToken")).toBe("refresh-3");
    expect(sessionStorage.getItem("refreshToken")).toBeNull();
  });

  it("getRefreshToken đọc được từ cả hai storage", async () => {
    const tokenService = await importTokenService();

    tokenService.storeTokens("access-1", "refresh-session", false);
    expect(tokenService.getRefreshToken()).toBe("refresh-session");

    tokenService.storeTokens("access-2", "refresh-local", true);
    expect(tokenService.getRefreshToken()).toBe("refresh-local");
  });

  it("migrates legacy persisted access tokens into memory and clears browser storage", async () => {
    sessionStorage.setItem("accessToken", "legacy-access");

    const tokenService = await importTokenService();

    expect(tokenService.getAccessToken()).toBe("legacy-access");
    expect(sessionStorage.getItem("accessToken")).toBeNull();
    expect(localStorage.getItem("accessToken")).toBeNull();
  });
});
