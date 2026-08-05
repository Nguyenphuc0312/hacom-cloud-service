import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const importTokenService = async () => import("./tokenService");

describe("tokenService remember-me persistence", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    sessionStorage.clear();
    // Nhóm test này kiểm tra hành vi chế độ "session" (refresh token nằm trong
    // storage). Mặc định giờ là "cookie" — phải khai báo rõ, không dựa ngầm vào
    // giá trị mặc định như trước.
    vi.stubEnv("VITE_REFRESH_TOKEN_STORAGE_MODE", "session");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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

  // V-04: refresh token trong localStorage biến một XSS đơn lẻ thành chiếm tài
  // khoản lâu dài. Chế độ cookie (mặc định, và ép cứng ở production) không được
  // ghi refresh token vào bất kỳ storage nào mà JS đọc được.
  it("chế độ cookie KHÔNG ghi refresh token vào localStorage/sessionStorage", async () => {
    vi.stubEnv("VITE_REFRESH_TOKEN_STORAGE_MODE", "cookie");
    vi.resetModules();
    const tokenService = await importTokenService();

    tokenService.storeTokens("access-1", "refresh-1", true);

    expect(localStorage.getItem("refreshToken")).toBeNull();
    expect(sessionStorage.getItem("refreshToken")).toBeNull();
    // Access token vẫn chỉ nằm trong bộ nhớ, dùng được bình thường.
    expect(tokenService.getAccessToken()).toBe("access-1");
    expect(localStorage.getItem("accessToken")).toBeNull();
  });

  it("mặc định là cookie khi env không khai báo", async () => {
    vi.stubEnv("VITE_REFRESH_TOKEN_STORAGE_MODE", "");
    vi.resetModules();
    const tokenService = await importTokenService();

    expect(tokenService.isRefreshTokenCookieMode()).toBe(true);
    tokenService.storeTokens("access-1", "refresh-1", true);
    expect(localStorage.getItem("refreshToken")).toBeNull();
  });

  it("migrates legacy persisted access tokens into memory and clears browser storage", async () => {
    sessionStorage.setItem("accessToken", "legacy-access");

    const tokenService = await importTokenService();

    expect(tokenService.getAccessToken()).toBe("legacy-access");
    expect(sessionStorage.getItem("accessToken")).toBeNull();
    expect(localStorage.getItem("accessToken")).toBeNull();
  });
});
