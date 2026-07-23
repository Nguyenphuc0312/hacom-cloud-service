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

  // ĐÁNH ĐỔI CÓ CHỦ Ý (xem tokenService.ts — storeTokens):
  // Yêu cầu sản phẩm là "giữ đăng nhập tới khi user tự đăng xuất", nên refresh
  // token LUÔN vào localStorage, kể cả khi không tick rememberMe. Hệ quả: phiên
  // sống qua đóng/mở trình duyệt dù user không chọn ghi nhớ; cờ rememberMe chỉ
  // còn ý nghĩa hiển thị. Nếu sau này muốn tôn trọng lựa chọn "không ghi nhớ"
  // thì đổi ở storeTokens (dùng sessionStorage) rồi cập nhật test này.
  it("persists refresh token in localStorage even when rememberMe=false", async () => {
    const tokenService = await importTokenService();

    tokenService.storeTokens("access-2", "refresh-2", false);

    expect(tokenService.getAccessToken()).toBe("access-2");
    expect(localStorage.getItem("refreshToken")).toBe("refresh-2");
    expect(sessionStorage.getItem("refreshToken")).toBeNull();
    // Không tick ghi nhớ thì không đánh dấu cờ, dù token vẫn được lưu.
    expect(localStorage.getItem("rememberMe")).toBeNull();
    // Access token không bao giờ chạm storage — chỉ nằm trong bộ nhớ.
    expect(localStorage.getItem("accessToken")).toBeNull();
    expect(sessionStorage.getItem("accessToken")).toBeNull();
  });

  it("migrates legacy persisted access tokens into memory and clears browser storage", async () => {
    sessionStorage.setItem("accessToken", "legacy-access");

    const tokenService = await importTokenService();

    expect(tokenService.getAccessToken()).toBe("legacy-access");
    expect(sessionStorage.getItem("accessToken")).toBeNull();
    expect(localStorage.getItem("accessToken")).toBeNull();
  });
});
